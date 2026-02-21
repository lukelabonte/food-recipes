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
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    const body = await response.json();
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
 * Create a PR with the recipe HTML file on a new branch.
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
 * @returns {Promise<{prUrl: string, prNumber: number}>}
 */
export async function createPR(token, repo, { slug, category, html, title, contributor, uploadId }) {
    const branch = `upload/${uploadId}`;
    const filePath = `${category}/${slug}.html`;

    // 1. Get default branch SHA
    const ref = await githubFetch(token, `/repos/${repo}/git/ref/heads/main`);
    const baseSha = ref.object.sha;

    // 2. Create branch
    await githubFetch(token, `/repos/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: baseSha
        })
    });

    // 3. Create file on the new branch
    const contentBase64 = btoa(unescape(encodeURIComponent(html)));
    await githubFetch(token, `/repos/${repo}/contents/${filePath}`, {
        method: 'PUT',
        body: JSON.stringify({
            message: `Add ${title} recipe`,
            content: contentBase64,
            branch
        })
    });

    // 4. Create PR
    const pr = await githubFetch(token, `/repos/${repo}/pulls`, {
        method: 'POST',
        body: JSON.stringify({
            title: `Add recipe: ${title}`,
            body: [
                `## New Recipe: ${title}`,
                '',
                `- **Contributor:** ${contributor}`,
                `- **Category:** ${category}`,
                `- **File:** \`${filePath}\``,
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
