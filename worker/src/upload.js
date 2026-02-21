/**
 * Upload processing pipeline.
 * Handles multipart form parsing, orchestrates extraction -> template -> GitHub PR.
 */

import { authenticate } from './auth.js';
import { extractRecipe } from './extract.js';
import { renderRecipeHTML } from './template.js';
import { createPR, slugify } from './github.js';

/**
 * Generate a ULID-like unique ID (timestamp + random).
 * @returns {string}
 */
function generateUploadId() {
    const timestamp = Date.now().toString(36);
    const random = Array.from(crypto.getRandomValues(new Uint8Array(5)),
        b => b.toString(36).padStart(2, '0')).join('');
    return `${timestamp}-${random}`;
}

/**
 * Handle recipe upload.
 * POST /upload — multipart form with: passphrase, text, url?, image?, notes?, recipeFrom?
 */
export async function handleUpload(request, env) {
    const formData = await request.formData();
    const passphrase = formData.get('passphrase');
    const text = formData.get('text');
    const url = formData.get('url');
    const imageFile = formData.get('image');
    const notes = formData.get('notes');
    const recipeFrom = formData.get('recipeFrom');

    // Validate required fields
    if (!text) {
        return new Response(JSON.stringify({ error: 'Recipe text is required' }), { status: 400 });
    }

    // Authenticate
    const user = await authenticate(env.KV, passphrase);
    if (!user) {
        return new Response(JSON.stringify({ error: 'Invalid passphrase' }), { status: 401 });
    }

    const uploadId = generateUploadId();
    const contributor = recipeFrom || user.displayName;

    // Store initial status
    await env.KV.put(`upload:${uploadId}`, JSON.stringify({
        status: 'processing',
        contributor,
        createdAt: new Date().toISOString()
    }));

    try {
        // Convert image to base64 if provided
        let imageBase64 = null;
        if (imageFile && imageFile.size > 0) {
            const buffer = await imageFile.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            const mediaType = imageFile.type || 'image/jpeg';
            imageBase64 = `data:${mediaType};base64,${base64}`;
        }

        // Optionally fetch URL content
        let urlContent = null;
        if (url) {
            try {
                const urlResponse = await fetch(url, {
                    headers: { 'User-Agent': 'RecipeUploadWorker/1.0' }
                });
                if (urlResponse.ok) {
                    urlContent = await urlResponse.text();
                    // Truncate to avoid overwhelming the model
                    if (urlContent.length > 50000) {
                        urlContent = urlContent.substring(0, 50000);
                    }
                }
            } catch (e) {
                // URL fetch failure is non-fatal — we still have the text
            }
        }

        // Extract structured recipe data
        const recipeData = await extractRecipe(env.ANTHROPIC_API_KEY, {
            text,
            urlContent,
            imageBase64,
            notes
        });

        // Override source URL if provided by the user
        if (url) {
            recipeData.sourceUrl = recipeData.sourceUrl || url;
        }

        // Generate slug and render HTML
        const slug = slugify(recipeData.title);
        const html = renderRecipeHTML(recipeData, { contributor, slug });

        // Create GitHub PR
        const { prUrl, prNumber } = await createPR(env.GITHUB_TOKEN, env.GITHUB_REPO, {
            slug,
            category: recipeData.category,
            html,
            title: recipeData.title,
            contributor,
            uploadId
        });

        // Update KV with success
        await env.KV.put(`upload:${uploadId}`, JSON.stringify({
            status: 'complete',
            title: recipeData.title,
            category: recipeData.category,
            slug,
            prUrl,
            prNumber,
            contributor,
            createdAt: new Date().toISOString()
        }));

        return new Response(JSON.stringify({
            id: uploadId,
            status: 'complete',
            title: recipeData.title,
            prUrl
        }), { status: 200 });

    } catch (error) {
        // Update KV with error
        await env.KV.put(`upload:${uploadId}`, JSON.stringify({
            status: 'error',
            error: error.message,
            contributor,
            createdAt: new Date().toISOString()
        }));

        return new Response(JSON.stringify({
            id: uploadId,
            status: 'error',
            error: error.message
        }), { status: 500 });
    }
}

/**
 * Get upload status by ID.
 * GET /upload/status/:id?passphrase=...
 */
export async function getUploadStatus(request, env, uploadId) {
    const url = new URL(request.url);
    const passphrase = url.searchParams.get('passphrase');

    // Authenticate
    const user = await authenticate(env.KV, passphrase);
    if (!user) {
        return new Response(JSON.stringify({ error: 'Invalid passphrase' }), { status: 401 });
    }

    const data = await env.KV.get(`upload:${uploadId}`, 'json');
    if (!data) {
        return new Response(JSON.stringify({ error: 'Upload not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({ id: uploadId, ...data }), { status: 200 });
}
