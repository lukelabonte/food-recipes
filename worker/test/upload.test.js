import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';
import { MAX_UPLOAD_BYTES, UPLOAD_SIZE_ERROR } from '../../assets/upload-limits.js';

for (const [name, type] of [['screenshot.png', 'image/png'], ['recipe.pdf', 'application/pdf']]) {
    test(`rejects an oversized ${name} with a CORS-enabled JSON 413 before processing`, async (context) => {
        const formData = new FormData();
        formData.set('text', 'Simmer vegetables.');
        formData.set('image', new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], name, { type }));
        const request = new Request('https://upload.invalid/upload', {
            method: 'POST', body: formData,
            headers: { Origin: 'https://example.com' }
        });
        const get = context.mock.fn();
        const put = context.mock.fn();
        const fetch = context.mock.method(globalThis, 'fetch', () => {
            throw new Error('Unexpected outbound request');
        });

        const response = await worker.fetch(request, {
            KV: { get, put }, ALLOWED_ORIGIN: 'https://example.com'
        });

        assert.equal(response.status, 413);
        assert.deepEqual(await response.json(), { error: UPLOAD_SIZE_ERROR });
        assert.equal(response.headers.get('Content-Type'), 'application/json');
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
        assert.equal(get.mock.callCount(), 0);
        assert.equal(put.mock.callCount(), 0);
        assert.equal(fetch.mock.callCount(), 0);
    });
}

for (const size of [0, MAX_UPLOAD_BYTES - 1, MAX_UPLOAD_BYTES]) {
    test(`a ${size}-byte file passes size validation and reaches authentication`, async () => {
        const formData = new FormData();
        formData.set('text', 'Simmer vegetables.');
        formData.set('image', new File([new Uint8Array(size)], 'screenshot.png', { type: 'image/png' }));

        const response = await worker.fetch(new Request('https://upload.invalid/upload', {
            method: 'POST', body: formData
        }), {});

        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), { error: 'Invalid passphrase' });
    });
}
