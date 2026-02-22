/**
 * Access request handler.
 * Stores requests in KV for admin review.
 * Creates a redacted GitHub Issue as notification (non-fatal if it fails).
 */

/**
 * Generate a simple unique ID for the request.
 * @returns {string}
 */
function generateId() {
    const timestamp = Date.now().toString(36);
    const random = Array.from(crypto.getRandomValues(new Uint8Array(4)),
        b => b.toString(36).padStart(2, '0')).join('');
    return `${timestamp}-${random}`;
}

/**
 * Create a redacted GitHub Issue to notify the admin.
 * No PII in the issue — just the request ID and timestamp.
 */
async function notifyViaGitHubIssue(token, repo, requestId, createdAt) {
    const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'RecipeUploadWorker/1.0',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: 'New access request',
            body: [
                'Someone submitted an access request.',
                '',
                `- **Request ID:** \`${requestId}\``,
                `- **Submitted:** ${createdAt}`,
                '',
                'To view details, run:',
                '```',
                `curl -H "X-Admin-Secret: $ADMIN_SECRET" https://recipe-upload.lukelabonte.workers.dev/admin/requests`,
                '```'
            ].join('\n'),
            labels: ['access-request']
        })
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`GitHub Issue creation failed (${response.status}): ${text.substring(0, 200)}`);
    }
}

/**
 * Handle an access request submission.
 * POST /request-access { name, contact, message }
 */
export async function handleRequestAccess(request, env) {
    const body = await request.json();
    const { name, contact, message } = body;

    if (!name || !contact) {
        return new Response(JSON.stringify({ error: 'name and contact are required' }), { status: 400 });
    }

    const id = generateId();
    const createdAt = new Date().toISOString();
    await env.KV.put(`request:${id}`, JSON.stringify({
        name,
        contact,
        message: message || '',
        createdAt
    }));

    // Fire-and-forget notification — don't block the response
    if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
        try {
            await notifyViaGitHubIssue(env.GITHUB_TOKEN, env.GITHUB_REPO, id, createdAt);
        } catch (e) {
            console.error('GitHub notification failed:', e.message);
        }
    }

    return new Response(JSON.stringify({ id, submitted: true }), { status: 201 });
}
