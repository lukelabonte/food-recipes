/**
 * Recipe Upload Worker — Router + CORS.
 *
 * Routes:
 *   POST   /upload                  Upload a recipe (passphrase auth)
 *   GET    /upload/status/:id       Check upload status (passphrase auth)
 *   POST   /request-access          Submit an access request (public)
 *   POST   /admin/users             Create a user (admin auth)
 *   DELETE /admin/users/:passphrase Delete a user (admin auth)
 *   GET    /admin/users             List users (admin auth)
 *   GET    /admin/requests          List access requests (admin auth)
 *   DELETE /admin/requests/:id      Delete an access request (admin auth)
 *   OPTIONS *                       CORS preflight
 */

import { handleUpload, getUploadStatus } from './upload.js';
import { handleRequestAccess } from './request-access.js';
import { verifyAdmin, createUser, deleteUser, listUsers, listRequests, deleteRequest } from './admin.js';

/**
 * Add CORS headers to a response.
 */
function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
        'Access-Control-Max-Age': '86400'
    };
}

/**
 * Wrap a Response with CORS headers.
 */
function withCors(response, origin) {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(origin))) {
        headers.set(key, value);
    }
    headers.set('Content-Type', 'application/json');
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

/**
 * Match a URL pathname against a pattern with :param segments.
 * Returns an object of matched params or null if no match.
 */
function matchRoute(pathname, pattern) {
    const pathParts = pathname.split('/').filter(Boolean);
    const patternParts = pattern.split('/').filter(Boolean);

    if (pathParts.length !== patternParts.length) return null;

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
        } else if (patternParts[i] !== pathParts[i]) {
            return null;
        }
    }
    return params;
}

export default {
    async fetch(request, env) {
        const allowedOrigin = env.ALLOWED_ORIGIN || '*';
        const url = new URL(request.url);
        const { pathname } = url;
        const method = request.method;

        // Handle CORS preflight
        if (method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: corsHeaders(allowedOrigin)
            });
        }

        try {
            let response;

            // POST /upload
            if (method === 'POST' && pathname === '/upload') {
                response = await handleUpload(request, env);
                return withCors(response, allowedOrigin);
            }

            // GET /upload/status/:id
            const statusMatch = matchRoute(pathname, '/upload/status/:id');
            if (method === 'GET' && statusMatch) {
                response = await getUploadStatus(request, env, statusMatch.id);
                return withCors(response, allowedOrigin);
            }

            // POST /request-access
            if (method === 'POST' && pathname === '/request-access') {
                response = await handleRequestAccess(request, env);
                return withCors(response, allowedOrigin);
            }

            // --- Admin routes ---
            // POST /admin/users
            if (method === 'POST' && pathname === '/admin/users') {
                if (!verifyAdmin(request, env.ADMIN_SECRET)) {
                    return withCors(
                        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 }),
                        allowedOrigin
                    );
                }
                response = await createUser(request, env);
                return withCors(response, allowedOrigin);
            }

            // GET /admin/users
            if (method === 'GET' && pathname === '/admin/users') {
                if (!verifyAdmin(request, env.ADMIN_SECRET)) {
                    return withCors(
                        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 }),
                        allowedOrigin
                    );
                }
                response = await listUsers(env.KV);
                return withCors(response, allowedOrigin);
            }

            // DELETE /admin/users/:passphrase
            const userDeleteMatch = matchRoute(pathname, '/admin/users/:passphrase');
            if (method === 'DELETE' && userDeleteMatch) {
                if (!verifyAdmin(request, env.ADMIN_SECRET)) {
                    return withCors(
                        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 }),
                        allowedOrigin
                    );
                }
                response = await deleteUser(env.KV, userDeleteMatch.passphrase);
                return withCors(response, allowedOrigin);
            }

            // GET /admin/requests
            if (method === 'GET' && pathname === '/admin/requests') {
                if (!verifyAdmin(request, env.ADMIN_SECRET)) {
                    return withCors(
                        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 }),
                        allowedOrigin
                    );
                }
                response = await listRequests(env.KV);
                return withCors(response, allowedOrigin);
            }

            // DELETE /admin/requests/:id
            const requestDeleteMatch = matchRoute(pathname, '/admin/requests/:id');
            if (method === 'DELETE' && requestDeleteMatch) {
                if (!verifyAdmin(request, env.ADMIN_SECRET)) {
                    return withCors(
                        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 }),
                        allowedOrigin
                    );
                }
                response = await deleteRequest(env.KV, requestDeleteMatch.id);
                return withCors(response, allowedOrigin);
            }

            // 404
            return withCors(
                new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
                allowedOrigin
            );

        } catch (error) {
            return withCors(
                new Response(JSON.stringify({ error: 'Internal server error', message: error.message }), { status: 500 }),
                allowedOrigin
            );
        }
    }
};
