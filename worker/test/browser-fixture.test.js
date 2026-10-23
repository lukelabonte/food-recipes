import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('./browser/image-optimizer.html', import.meta.url), 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

async function prepareFixture({ missingContext = false } = {}) {
    const elements = new Map();
    const drawing = {
        createImageData: () => ({ data: new Uint8Array(4) }),
        putImageData() {}, fillRect() {}, fillText() {}, drawImage() {}
    };
    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, { textContent: '', disabled: true, addEventListener() {}, append() {} });
            return elements.get(id);
        },
        createElement() {
            return {
                append() {},
                getContext: () => missingContext ? null : drawing,
                toBlob: (callback, type) => callback(new Blob(['small'], { type }))
            };
        }
    };
    await runInNewContext(`(async () => { ${script} })()`, {
        document, performance: { now: () => 0 }, navigator: { userAgent: 'Fixture unit check' },
        Uint8Array, Blob, createImageBitmap: async () => ({ close() {} })
    });
    return {
        message: document.getElementById('results').textContent,
        disabled: document.getElementById('run').disabled
    };
}

test('browser fixture setup failures produce a visible FAIL verdict', async () => {
    const result = await prepareFixture({ missingContext: true });
    assert.match(result.message, /FAIL fixture preparation:/);
    assert.equal(result.disabled, true);
});

test('an unexpectedly small probe is reported as a fixture failure, not an indefinite pending state', async () => {
    const result = await prepareFixture();
    assert.match(result.message, /FAIL fixture preparation:.*source fixture must actually exceed/s);
    assert.equal(result.disabled, true);
});
