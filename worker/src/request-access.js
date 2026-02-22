/**
 * Access request handler.
 * Stores requests in KV for admin review.
 * Sends an email notification to the admin via Resend (non-fatal if it fails).
 */

import { notifyAdminOfRequest } from './email.js';

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
 * Handle an access request submission.
 * POST /request-access { name, contact, message }
 */
export async function handleRequestAccess(request, env) {
    const body = await request.json();
    const { name, contact, message } = body;

    if (!name || !contact) {
        return new Response(JSON.stringify({ error: 'name and email are required' }), { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
        return new Response(JSON.stringify({ error: 'A valid email address is required' }), { status: 400 });
    }

    const id = generateId();
    const createdAt = new Date().toISOString();
    await env.KV.put(`request:${id}`, JSON.stringify({
        name,
        contact,
        message: message || '',
        createdAt
    }));

    // Fire-and-forget email notification — don't block the response
    try {
        await notifyAdminOfRequest(env, {
            requestId: id,
            name,
            contact,
            message: message || '',
            createdAt
        });
    } catch (e) {
        console.error('Admin notification failed:', e.message);
    }

    return new Response(JSON.stringify({ id, submitted: true }), { status: 201 });
}
