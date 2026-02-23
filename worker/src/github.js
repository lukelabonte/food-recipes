/**
 * GitHub REST API integration for creating recipe PRs.
 */

const GITHUB_API = 'https://api.github.com';

/**
 * Make an authenticated GitHub API request.
 */
async function githubFetch(token, path, options = {}) {
    const url = path.startsWith('http') ? path : `${GITHUB_API}${path}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'RecipeUploadWorker/1.0',
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    const text = await response.text();
    let body;
    try {
        body = JSON.parse(text);
    } catch (e) {
        throw new Error(`GitHub API non-JSON response (${response.status}) for ${path}: ${text.substring(0, 300)}`);
    }
    if (!response.ok) {
        throw new Error(`GitHub API error (${response.status}): ${JSON.stringify(body)}`);
    }
    return body;
}

/**
 * Generate a URL-safe slug from a recipe title.
 * Lowercase, hyphens for spaces, no special chars, max 60 chars.
 */
export function slugify(title) {
    return title
        .toLowerCase()
        .replace(/['']/g, '')            // Remove apostrophes
        .replace(/[^a-z0-9]+/g, '-')     // Replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/g, '')         // Trim leading/trailing hyphens
        .substring(0, 60);
}

/**
 * Create a blob in the repo (for multi-file commits via Git Trees API).
 * @param {string} token - GitHub PAT
 * @param {string} repo - "owner/repo" format
 * @param {string} content - File content (UTF-8 text or base64)
 * @param {string} [encoding='utf-8'] - 'utf-8' for text, 'base64' for binary
 * @returns {Promise<string>} Blob SHA
 */
async function createBlob(token, repo, content, encoding = 'utf-8') {
    const blob = await githubFetch(token, `/repos/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content, encoding })
    });
    return blob.sha;
}

/**
 * Create a PR with recipe files (HTML + prompt.txt + optional source image) on a new branch.
 *
 * Uses the Git Trees API to commit multiple files in a single commit.
 *
 * @param {string} token - GitHub PAT
 * @param {string} repo - "owner/repo" format
 * @param {object} params
 * @param {string} params.slug - URL-safe recipe name
 * @param {string} params.category - Recipe category directory
 * @param {string} params.html - Full HTML content
 * @param {string} params.title - Recipe title for PR
 * @param {string} params.contributor - Display name of uploader
 * @param {string} params.uploadId - Upload ID for traceability
 * @param {string} [params.photoPrompt] - Visual description for AI photo generation
 * @param {string} [params.sourceImageBase64] - Base64-encoded source image (without data: prefix)
 * @param {string} [params.sourceImageExt] - File extension for source image (e.g., 'jpg', 'png')
 * @returns {Promise<{prUrl: string, prNumber: number}>}
 */
export async function createPR(token, repo, {
    slug, category, html, title, contributor, uploadId,
    photoPrompt, sourceImageBase64, sourceImageExt
}) {
    const branch = `upload/${uploadId}`;
    const htmlPath = `${category}/${slug}.html`;

    // 1. Get default branch SHA and base tree
    const ref = await githubFetch(token, `/repos/${repo}/git/ref/heads/main`);
    const baseSha = ref.object.sha;
    const baseCommit = await githubFetch(token, `/repos/${repo}/git/commits/${baseSha}`);
    const baseTreeSha = baseCommit.tree.sha;

    // 2. Create branch
    await githubFetch(token, `/repos/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: baseSha
        })
    });

    // 3. Create blobs for all files
    const htmlBlob = await createBlob(token, repo, html);

    const treeItems = [
        { path: htmlPath, mode: '100644', type: 'blob', sha: htmlBlob }
    ];

    if (photoPrompt) {
        const promptBlob = await createBlob(token, repo, photoPrompt);
        treeItems.push({
            path: `assets/photos/${slug}/prompt.txt`,
            mode: '100644', type: 'blob', sha: promptBlob
        });
    }

    if (sourceImageBase64 && sourceImageExt) {
        const imageBlob = await createBlob(token, repo, sourceImageBase64, 'base64');
        treeItems.push({
            path: `assets/photos/${slug}/source-1.${sourceImageExt}`,
            mode: '100644', type: 'blob', sha: imageBlob
        });
    }

    // 4. Create tree
    const tree = await githubFetch(token, `/repos/${repo}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({
            base_tree: baseTreeSha,
            tree: treeItems
        })
    });

    // 5. Create commit
    const commit = await githubFetch(token, `/repos/${repo}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({
            message: `Add ${title} recipe`,
            tree: tree.sha,
            parents: [baseSha]
        })
    });

    // 6. Update branch ref to point to new commit
    await githubFetch(token, `/repos/${repo}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha })
    });

    // 7. Create PR
    const fileList = treeItems.map(f => `\`${f.path}\``).join(', ');
    const pr = await githubFetch(token, `/repos/${repo}/pulls`, {
        method: 'POST',
        body: JSON.stringify({
            title: `Add recipe: ${title}`,
            body: [
                `## New Recipe: ${title}`,
                '',
                `- **Contributor:** ${contributor}`,
                `- **Category:** ${category}`,
                `- **Files:** ${fileList}`,
                `- **Upload ID:** \`${uploadId}\``,
                '',
                'This PR was automatically created by the recipe upload worker.'
            ].join('\n'),
            head: branch,
            base: 'main'
        })
    });

    return { prUrl: pr.html_url, prNumber: pr.number };
}
