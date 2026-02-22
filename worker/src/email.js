/**
 * Email helper using Resend API.
 * Sends transactional emails for access requests and user approvals.
 */

const RESEND_API = 'https://api.resend.com/emails';

/**
 * Send an email via Resend.
 * @param {string} apiKey - Resend API key
 * @param {object} options
 * @param {string} options.from - Sender address
 * @param {string} options.to - Recipient address
 * @param {string} options.subject
 * @param {string} options.html - HTML body
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function sendEmail(apiKey, { from, to, subject, html }) {
    const response = await fetch(RESEND_API, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from, to, subject, html })
    });

    if (!response.ok) {
        const text = await response.text();
        return { ok: false, error: `Resend API error (${response.status}): ${text.substring(0, 200)}` };
    }

    return { ok: true };
}

/**
 * Notify admin of a new access request.
 */
export async function notifyAdminOfRequest(env, { requestId, name, contact, message, createdAt }) {
    if (!env.RESEND_API_KEY || !env.ADMIN_EMAIL) return;

    const from = env.FROM_EMAIL || 'Copy & Pastry <onboarding@resend.dev>';
    const siteBase = env.ALLOWED_ORIGIN || 'https://copyandpastry.com';
    const result = await sendEmail(env.RESEND_API_KEY, {
        from,
        to: env.ADMIN_EMAIL,
        subject: `New access request from ${name}`,
        html: [
            `<h2>New access request</h2>`,
            `<p><strong>Name:</strong> ${escapeHtml(name)}</p>`,
            `<p><strong>Contact:</strong> ${escapeHtml(contact)}</p>`,
            message ? `<p><strong>Message:</strong> ${escapeHtml(message)}</p>` : '',
            `<p><strong>Submitted:</strong> ${createdAt}</p>`,
            `<hr>`,
            `<p><a href="${siteBase}/admin" style="display:inline-block;padding:10px 20px;background:#8b6f4e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Review in Admin Dashboard</a></p>`,
        ].join('\n')
    });

    if (!result.ok) {
        console.error('Admin notification email failed:', result.error);
    }
}

/**
 * Send a welcome email with passphrase to a new user.
 */
export async function sendWelcomeEmail(env, { email, displayName, passphrase }) {
    if (!env.RESEND_API_KEY) return;

    const from = env.FROM_EMAIL || 'Copy & Pastry <onboarding@resend.dev>';
    const result = await sendEmail(env.RESEND_API_KEY, {
        from,
        to: email,
        subject: `Your Copy & Pastry passphrase`,
        html: [
            `<h2>Welcome to Copy & Pastry, ${escapeHtml(displayName)}!</h2>`,
            `<p>You've been approved to upload recipes. Here's your passphrase:</p>`,
            `<p style="font-size: 1.3em; font-family: monospace; background: #f5f0ea; padding: 12px 16px; border-radius: 8px; display: inline-block;"><strong>${escapeHtml(passphrase)}</strong></p>`,
            `<p>Use it on the <a href="https://copyandpastry.com/upload">upload page</a> to submit recipes.</p>`,
            `<p>Keep this passphrase private — it's your identity on the site.</p>`,
        ].join('\n')
    });

    if (!result.ok) {
        console.error('Welcome email failed:', result.error);
    }

    return result;
}

/**
 * Basic HTML escaping to prevent injection in email templates.
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
