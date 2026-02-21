/**
 * Access request handler.
 * Stores requests in KV for admin review.
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
 * Handle an access request submission.
 * POST /request-access { name, contact, message }
 */
export async function handleRequestAccess(request, kv) {
    const body = await request.json();
    const { name, contact, message } = body;

    if (!name || !contact) {
        return new Response(JSON.stringify({ error: 'name and contact are required' }), { status: 400 });
    }

    const id = generateId();
    await kv.put(`request:${id}`, JSON.stringify({
        name,
        contact,
        message: message || '',
        createdAt: new Date().toISOString()
    }));

    return new Response(JSON.stringify({ id, submitted: true }), { status: 201 });
}
