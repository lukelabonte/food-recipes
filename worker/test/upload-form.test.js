import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { MAX_UPLOAD_BYTES, UPLOAD_SIZE_ERROR } from '../../assets/upload-limits.js';

const html = await readFile(new URL('../../upload.html', import.meta.url), 'utf8');
const script = html.match(/<script(?: type="module")?>([\s\S]*?)<\/script>/)[1];

// Run the real page handlers with only the DOM surface they use. No requests leave this harness.
function loadForm(fetchResponse) {
    const elements = new Map();
    function element() {
        const classes = new Set();
        return {
            textContent: '',
            className: '',
            disabled: false,
            value: '',
            files: [],
            listeners: {},
            classList: {
                add: (name) => classes.add(name),
                remove: (name) => classes.delete(name),
                contains: (name) => classes.has(name)
            },
            addEventListener(name, handler) { this.listeners[name] = handler; },
            setAttribute(name, value) { this[name] = value; },
            removeAttribute(name) { delete this[name]; },
            appendChild(child) { this.textContent += child.textContent; },
            focus() { this.focused = true; }
        };
    }
    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, element());
            return elements.get(id);
        },
        createElement: element,
        createTextNode: (textContent) => ({ textContent })
    };
    const form = document.getElementById('upload-form');
    const button = element();
    button.textContent = 'Upload Recipe';
    form.action = 'https://upload.invalid/upload';
    form.querySelector = () => button;
    form.reset = () => {
        form.wasReset = true;
        document.getElementById('image').files = [];
    };
    const requests = [];
    let formDataCount = 0;
    // Bind the same exports as the browser's module import inside the isolated VM.
    runInNewContext(script.replace(/import \{ MAX_UPLOAD_BYTES, UPLOAD_SIZE_ERROR \} from '\.\/assets\/upload-limits.js';/, ''), {
        document,
        MAX_UPLOAD_BYTES,
        UPLOAD_SIZE_ERROR,
        FormData: class { constructor() { formDataCount++; } },
        fetch: async (...arguments_) => {
            requests.push(arguments_);
            return fetchResponse();
        }
    });
    return {
        document, button, form, requests,
        get formDataCount() { return formDataCount; },
        selectFile(size, name = 'screenshot.png') {
            const input = document.getElementById('image');
            input.files = [{ name, size }];
            input.listeners.change.call(input);
        },
        clearFile() {
            document.getElementById('image').files = [];
            document.getElementById('file-clear').listeners.click({
                preventDefault() {}, stopPropagation() {}
            });
        },
        async submit() {
            await form.listeners.submit.call(form, { preventDefault() {} });
        }
    };
}

test('the browser imports the shared limits and associates the file input with its help and alert', () => {
    assert.match(script, /import \{ MAX_UPLOAD_BYTES, UPLOAD_SIZE_ERROR \} from '\.\/assets\/upload-limits.js';/);
    assert.match(html, /id="image"[^>]*aria-describedby="file-help file-error"/);
    assert.match(html, /id="file-error" role="alert"/);
    assert.ok(html.includes(`Maximum file size: ${MAX_UPLOAD_BYTES / 1_000_000} MB.`));
    assert.ok(4 * Math.ceil(MAX_UPLOAD_BYTES / 3) <= 10_000_000);
});

for (const [name, body] of [
    ['HTML', '<html>Request Entity Too Large</html>'],
    ['empty', null],
    ['JSON', JSON.stringify({ error: UPLOAD_SIZE_ERROR })]
]) {
    test(`a ${name} 413 response reports an oversized upload, not a network error`, async () => {
        const page = loadForm(() => new Response(body, { status: 413 }));
        await page.submit();

        const status = page.document.getElementById('upload-status');
        assert.equal(status.className, 'status-error visible');
        assert.equal(status.textContent, UPLOAD_SIZE_ERROR);
        assert.doesNotMatch(status.textContent, /network|connection/i);
        assert.equal(page.button.disabled, false);
    });
}

test('selecting an oversized screenshot immediately shows an accessible size error', () => {
    const page = loadForm(() => { throw new Error('Unexpected request'); });
    page.selectFile(MAX_UPLOAD_BYTES + 1);

    assert.equal(page.document.getElementById('file-error').textContent, UPLOAD_SIZE_ERROR);
    assert.equal(page.document.getElementById('image')['aria-invalid'], 'true');
    assert.equal(page.requests.length, 0);
    assert.equal(page.formDataCount, 0);
});

test('submit rechecks file size without relying on the change event', async () => {
    const page = loadForm(() => { throw new Error('Unexpected request'); });
    page.document.getElementById('image').files = [{ name: 'large.png', size: MAX_UPLOAD_BYTES + 1 }];
    await page.submit();

    assert.equal(page.document.getElementById('file-error').textContent, UPLOAD_SIZE_ERROR);
    assert.equal(page.requests.length, 0);
    assert.equal(page.formDataCount, 0);
    assert.equal(page.button.disabled, false);
    assert.equal(page.button.textContent, 'Upload Recipe');
    assert.equal(page.form.wasReset, undefined);
});

for (const name of ['screenshot.png', 'photo.jpg', 'recipe.pdf']) {
    test(`${name} is accepted at the byte limit and rejected one byte above`, async () => {
        const page = loadForm(() => Response.json({ error: 'Recipe text is required' }, { status: 400 }));
        page.selectFile(MAX_UPLOAD_BYTES, name);
        assert.equal(page.document.getElementById('file-error').textContent, '');
        await page.submit();
        assert.equal(page.requests.length, 1);

        page.selectFile(MAX_UPLOAD_BYTES + 1, name);
        await page.submit();
        assert.equal(page.document.getElementById('file-error').textContent, UPLOAD_SIZE_ERROR);
        assert.equal(page.requests.length, 1);
    });
}

test('removing an oversized file clears the error and allows a text-only upload', async () => {
    const page = loadForm(() => Response.json({ error: 'Invalid passphrase' }, { status: 401 }));
    page.selectFile(MAX_UPLOAD_BYTES + 1);
    page.clearFile();

    assert.equal(page.document.getElementById('file-error').textContent, '');
    assert.equal(page.document.getElementById('image')['aria-invalid'], undefined);
    assert.equal(page.document.getElementById('file-text').textContent, 'Choose a photo or PDF...');
    await page.submit();
    assert.equal(page.requests.length, 1);
    assert.equal(page.document.getElementById('upload-status').textContent, 'Invalid passphrase');
});

test('replacing an oversized file clears the error and allows uploading', async () => {
    const page = loadForm(() => Response.json({ error: 'Invalid passphrase' }, { status: 401 }));
    page.selectFile(MAX_UPLOAD_BYTES + 1);
    page.selectFile(1024);

    assert.equal(page.document.getElementById('file-error').textContent, '');
    assert.equal(page.document.getElementById('image')['aria-invalid'], undefined);
    await page.submit();
    assert.equal(page.requests.length, 1);
});

test('a genuine connection failure still shows connection advice and enables retry', async () => {
    const page = loadForm(() => { throw new TypeError('Failed to fetch'); });
    await page.submit();

    assert.match(page.document.getElementById('upload-status').textContent, /connection/i);
    assert.equal(page.button.disabled, false);
    assert.equal(page.button.textContent, 'Upload Recipe');
});

test('a non-JSON server error is not mislabeled as a network failure', async () => {
    const page = loadForm(() => new Response('<html>Unavailable</html>', { status: 502 }));
    await page.submit();

    const message = page.document.getElementById('upload-status').textContent;
    assert.match(message, /server|response/i);
    assert.doesNotMatch(message, /network|connection/i);
    assert.equal(page.button.disabled, false);
});

test('successful upload preserves the completion message and resets the selected file', async () => {
    const page = loadForm(() => Response.json({
        status: 'complete', title: 'Soup', prUrl: 'https://example.com/recipe'
    }));
    page.selectFile(1024);
    await page.submit();

    assert.equal(page.form.wasReset, true);
    assert.equal(page.document.getElementById('upload-status').className, 'status-success visible');
    assert.match(page.document.getElementById('upload-status').textContent, /Soup uploaded!/);
    assert.equal(page.document.getElementById('file-text').textContent, 'Choose a photo or PDF...');
    assert.equal(page.button.disabled, false);
});
