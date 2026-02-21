/**
 * Admin endpoints for user and access request management.
 * All endpoints require X-Admin-Secret header matching ADMIN_SECRET env var.
 */

/**
 * Verify admin authentication.
 * @param {Request} request
 * @param {string} adminSecret
 * @returns {boolean}
 */
export function verifyAdmin(request, adminSecret) {
    const provided = request.headers.get('X-Admin-Secret');
    return provided === adminSecret;
}

/**
 * Generate a random 12-character alphanumeric passphrase.
 * @returns {string}
 */
function generatePassphrase() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => chars[b % chars.length]).join('');
}

/**
 * Create a new user with a generated passphrase.
 * POST /admin/users { displayName }
 */
export async function createUser(request, kv) {
    const body = await request.json();
    const { displayName } = body;

    if (!displayName) {
        return new Response(JSON.stringify({ error: 'displayName is required' }), { status: 400 });
    }

    const passphrase = generatePassphrase();
    await kv.put(`auth:${passphrase}`, JSON.stringify({
        displayName,
        createdAt: new Date().toISOString()
    }));

    return new Response(JSON.stringify({ passphrase, displayName }), { status: 201 });
}

/**
 * List all users.
 * GET /admin/users
 */
export async function listUsers(kv) {
    const list = await kv.list({ prefix: 'auth:' });
    const users = [];

    for (const key of list.keys) {
        const data = await kv.get(key.name, 'json');
        if (data) {
            users.push({
                passphrase: key.name.replace('auth:', ''),
                displayName: data.displayName,
                createdAt: data.createdAt
            });
        }
    }

    return new Response(JSON.stringify({ users }), { status: 200 });
}

/**
 * Delete a user by passphrase.
 * DELETE /admin/users/:passphrase
 */
export async function deleteUser(kv, passphrase) {
    const existing = await kv.get(`auth:${passphrase}`, 'json');
    if (!existing) {
        return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
    }

    await kv.delete(`auth:${passphrase}`);
    return new Response(JSON.stringify({ deleted: true }), { status: 200 });
}

/**
 * List all access requests.
 * GET /admin/requests
 */
export async function listRequests(kv) {
    const list = await kv.list({ prefix: 'request:' });
    const requests = [];

    for (const key of list.keys) {
        const data = await kv.get(key.name, 'json');
        if (data) {
            requests.push({
                id: key.name.replace('request:', ''),
                ...data
            });
        }
    }

    return new Response(JSON.stringify({ requests }), { status: 200 });
}

/**
 * Delete an access request by ID.
 * DELETE /admin/requests/:id
 */
export async function deleteRequest(kv, id) {
    const existing = await kv.get(`request:${id}`, 'json');
    if (!existing) {
        return new Response(JSON.stringify({ error: 'Request not found' }), { status: 404 });
    }

    await kv.delete(`request:${id}`);
    return new Response(JSON.stringify({ deleted: true }), { status: 200 });
}
