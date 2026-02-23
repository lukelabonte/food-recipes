/**
 * Admin endpoints for user and access request management.
 * All endpoints require X-Admin-Secret header matching ADMIN_SECRET env var.
 */

import { sendWelcomeEmail } from './email.js';

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
 * Create a new user with an admin-chosen passphrase.
 * POST /admin/users { displayName, passphrase, email? }
 * If email is provided, sends a welcome email with the passphrase.
 */
export async function createUser(request, env) {
    const body = await request.json();
    const { displayName, passphrase, email } = body;

    if (!displayName) {
        return new Response(JSON.stringify({ error: 'displayName is required' }), { status: 400 });
    }
    if (!passphrase || passphrase.trim().length < 3) {
        return new Response(JSON.stringify({ error: 'passphrase is required (3+ characters)' }), { status: 400 });
    }

    const clean = passphrase.trim().toLowerCase();

    // Check for duplicates
    const existing = await env.KV.get(`auth:${clean}`, 'json');
    if (existing) {
        return new Response(JSON.stringify({ error: 'That passphrase is already in use' }), { status: 409 });
    }

    await env.KV.put(`auth:${clean}`, JSON.stringify({
        displayName,
        createdAt: new Date().toISOString()
    }));

    // Send welcome email if email address provided
    let emailSent = false;
    if (email) {
        try {
            const result = await sendWelcomeEmail(env, { email, displayName, passphrase: clean });
            emailSent = result && result.ok;
        } catch (e) {
            console.error('Welcome email failed:', e.message);
        }
    }

    return new Response(JSON.stringify({ passphrase: clean, displayName, emailSent }), { status: 201 });
}

/**
 * Update a user's passphrase and/or display name.
 * PUT /admin/users/:passphrase { newPassphrase?, newDisplayName? }
 */
export async function updateUser(kv, oldPassphrase, updates) {
    const { newPassphrase, newDisplayName } = updates;
    const userData = await kv.get(`auth:${oldPassphrase}`, 'json');
    if (!userData) {
        return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
    }

    if (!newPassphrase && !newDisplayName) {
        return new Response(JSON.stringify({ error: 'Nothing to update' }), { status: 400 });
    }

    // Update display name if provided
    if (newDisplayName) {
        if (newDisplayName.trim().length < 1) {
            return new Response(JSON.stringify({ error: 'Display name cannot be empty' }), { status: 400 });
        }
        userData.displayName = newDisplayName.trim();
    }

    // If passphrase is changing, do the key rename
    if (newPassphrase) {
        if (newPassphrase.trim().length < 3) {
            return new Response(JSON.stringify({ error: 'New passphrase is required (3+ characters)' }), { status: 400 });
        }

        const clean = newPassphrase.trim().toLowerCase();
        if (clean === oldPassphrase) {
            return new Response(JSON.stringify({ error: 'New passphrase must be different' }), { status: 400 });
        }

        const conflict = await kv.get(`auth:${clean}`, 'json');
        if (conflict) {
            return new Response(JSON.stringify({ error: 'That passphrase is already in use' }), { status: 409 });
        }

        // KV has no transactions. Write-then-delete means a partial failure could leave
        // the user under both passphrases — safer than delete-first which risks data loss.
        await kv.put(`auth:${clean}`, JSON.stringify(userData));
        await kv.delete(`auth:${oldPassphrase}`);

        return new Response(JSON.stringify({ passphrase: clean, displayName: userData.displayName }), { status: 200 });
    }

    // Name-only update: overwrite value at the same key
    await kv.put(`auth:${oldPassphrase}`, JSON.stringify(userData));
    return new Response(JSON.stringify({ passphrase: oldPassphrase, displayName: userData.displayName }), { status: 200 });
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
