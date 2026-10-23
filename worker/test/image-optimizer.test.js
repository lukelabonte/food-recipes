import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectImage, optimizeImage } from '../../assets/image-optimizer.js';
import { MAX_UPLOAD_BYTES } from '../../assets/upload-limits.js';

// Container headers exercise pre-decode checks. Browser fixtures separately exercise real codecs.
function chunk(name, data = new Uint8Array()) {
    const bytes = new Uint8Array(data.length + 12);
    new DataView(bytes.buffer).setUint32(0, data.length);
    bytes.set(new TextEncoder().encode(name), 4);
    bytes.set(data, 8);
    return bytes;
}

function png(width = 2000, height = 2000, { animated = false, padding = 0 } = {}) {
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    return new Blob([
        Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', header),
        ...(animated ? [chunk('acTL', new Uint8Array(8))] : []),
        ...(padding ? [chunk('tEXt', new Uint8Array(padding))] : []),
        chunk('IDAT'), chunk('IEND')
    ], { type: 'image/png' });
}

function jpeg(width = 2000, height = 2000) {
    return new Blob([Uint8Array.of(255, 216, 255, 192, 0, 11, 8,
        height >> 8, height & 255, width >> 8, width & 255, 1, 1, 17, 0, 255, 217)], { type: 'image/jpeg' });
}

function webp(width = 2000, height = 2000, { animated = false, lossless = false } = {}) {
    const length = lossless ? 6 : 10;
    const bytes = new Uint8Array(12 + 8 + length + (animated ? 18 : 0));
    const view = new DataView(bytes.buffer);
    const writeTag = (offset, name) => bytes.set(new TextEncoder().encode(name), offset);
    writeTag(0, 'RIFF');
    view.setUint32(4, bytes.length - 8, true);
    writeTag(8, 'WEBP');
    let offset = 12;
    if (animated) {
        writeTag(offset, 'VP8X');
        view.setUint32(offset + 4, 10, true);
        bytes[offset + 8] = 2;
        offset += 18;
    }
    writeTag(offset, lossless ? 'VP8L' : 'VP8 ');
    view.setUint32(offset + 4, lossless ? 5 : 10, true);
    if (lossless) {
        bytes[offset + 8] = 0x2f;
        view.setUint32(offset + 9, (width - 1) | ((height - 1) << 14), true);
    } else {
        bytes.set([0x9d, 1, 0x2a], offset + 11);
        view.setUint16(offset + 14, width, true);
        view.setUint16(offset + 16, height, true);
    }
    return new Blob([bytes], { type: 'image/webp' });
}

for (const [name, blob, type] of [
    ['PNG', png(), 'image/png'], ['JPEG', jpeg(), 'image/jpeg'],
    ['WebP', webp(), 'image/webp'], ['lossless WebP', webp(2000, 2000, { lossless: true }), 'image/webp']
]) {
    test(`inspects ${name} dimensions from content, not filename or MIME`, async () => {
        assert.deepEqual(await inspectImage(new File([blob], 'wrong.gif', { type: 'application/octet-stream' })),
            { type, width: 2000, height: 2000 });
    });
}

for (const [name, blob] of [
    ['APNG', png(100, 100, { animated: true })],
    ['animated WebP', webp(100, 100, { animated: true })],
    ['GIF', new Blob(['GIF89a'])], ['PDF', new Blob(['%PDF'])], ['HEIC', new Blob(['ftypheic'])]
]) {
    test(`rejects ${name} without flattening it`, async () => {
        await assert.rejects(inspectImage(blob), /Only non-animated/);
    });
}

test('rejects input over the byte budget before reading it', async () => {
    await assert.rejects(inspectImage({
        size: 20_000_001,
        arrayBuffer() { throw new Error('Must not read this file'); }
    }), /safe processing limits/);
});

test('allows a 12-megapixel phone photo but rejects excessive dimensions before decoding', async () => {
    assert.deepEqual(await inspectImage(jpeg(4032, 3024)), { type: 'image/jpeg', width: 4032, height: 3024 });
    for (const blob of [png(3000, 4200), png(5401, 1), jpeg(0, 10), webp(5401, 1)]) {
        await assert.rejects(inspectImage(blob), /processing limits|read safely/);
    }
});

test('rejects truncated and inconsistent containers', async () => {
    for (const original of [png(), jpeg(), webp()]) {
        await assert.rejects(inspectImage(original.slice(0, original.size - 5)));
    }
    const corrupt = new Uint8Array(await webp().arrayBuffer());
    new DataView(corrupt.buffer).setUint32(4, 9999, true);
    await assert.rejects(inspectImage(new Blob([corrupt])), /read safely/);
});

test('leaves small files unchanged without decoding or re-encoding', async () => {
    const file = new File(['small'], 'original.png', { type: 'image/png' });
    assert.equal(await optimizeImage(file), file);
});

function replaceGlobal(context, name, value) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    context.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
}

const largeFile = new File([png(2000, 2000, { padding: MAX_UPLOAD_BYTES })], 'recipe.png', { type: 'image/png' });
const oversizedOutput = new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)], { type: 'image/png' });

function codecs(context, exportBlob, { width = 2000, height = 2000 } = {}) {
    const bitmap = { width, height, close: context.mock.fn() };
    const drawing = { drawImage: context.mock.fn(), fillRect: context.mock.fn() };
    const canvas = {
        width: 0, height: 0,
        getContext: () => drawing,
        toBlob: context.mock.fn((callback, type, quality) => callback(exportBlob(canvas, type, quality)))
    };
    const decode = context.mock.fn(async () => bitmap);
    replaceGlobal(context, 'createImageBitmap', decode);
    replaceGlobal(context, 'document', { createElement: () => canvas });
    return { bitmap, drawing, canvas, decode };
}

test('prefers lossless encoding and matches the output filename to the actual encoding', async (context) => {
    const mocks = codecs(context, (canvas) => png(canvas.width, canvas.height));
    const result = await optimizeImage(largeFile);
    assert.equal(result.name, 'recipe-optimized.png');
    assert.equal(result.type, 'image/png');
    assert.equal(mocks.canvas.toBlob.mock.callCount(), 1);
    assert.equal(mocks.bitmap.close.mock.callCount(), 1);
    assert.equal(mocks.canvas.width, 0);
    assert.equal(mocks.decode.mock.calls[0].arguments[1].imageOrientation, 'from-image');
});

test('uses high-quality WebP only after lossless output fails the cap', async (context) => {
    const mocks = codecs(context, (canvas, type, quality) => {
        assert.equal(quality, 0.95);
        return type === 'image/png' ? oversizedOutput : webp(canvas.width, canvas.height);
    });
    const result = await optimizeImage(largeFile);
    assert.equal(result.type, 'image/webp');
    assert.equal(result.name, 'recipe-optimized.webp');
    assert.equal(mocks.canvas.toBlob.mock.callCount(), 2);
    assert.deepEqual(mocks.canvas.toBlob.mock.calls.map((call) => call.arguments[1]), ['image/png', 'image/webp']);
});

test('accepts actual PNG when the browser falls back from unsupported WebP export', async (context) => {
    let count = 0;
    codecs(context, (canvas) => ++count === 1 ? oversizedOutput : png(canvas.width, canvas.height));
    assert.equal((await optimizeImage(largeFile)).name, 'recipe-optimized.png');
});

test('bounded attempts start from the source, never shrink below 75%, and release resources on failure', async (context) => {
    const mocks = codecs(context, () => oversizedOutput);
    await assert.rejects(optimizeImage(largeFile), /without more quality loss/);
    assert.equal(mocks.canvas.toBlob.mock.callCount(), 9);
    assert.equal(mocks.drawing.fillRect.mock.callCount(), 3);
    assert.equal(mocks.drawing.fillStyle, '#fff');
    assert.deepEqual(mocks.drawing.drawImage.mock.calls.map(({ arguments: arguments_ }) => {
        assert.equal(arguments_[0], mocks.bitmap);
        return arguments_.slice(3);
    }), [[2000, 2000], [2000, 2000], [2000, 2000], [1700, 1700], [1700, 1700], [1700, 1700],
        [1500, 1500], [1500, 1500], [1500, 1500]]);
    assert.equal(mocks.bitmap.close.mock.callCount(), 1);
    assert.equal(mocks.canvas.width, 0);
});

test('handles null exports without uploading an empty result', async (context) => {
    const mocks = codecs(context, () => null);
    await assert.rejects(optimizeImage(largeFile), /without more quality loss/);
    assert.equal(mocks.bitmap.close.mock.callCount(), 1);
});

test('verifies actual output dimensions and MIME rather than trusting encoder metadata', async (context) => {
    const mocks = codecs(context, () => png(10, 10));
    await assert.rejects(optimizeImage(largeFile), /read safely/);
    assert.equal(mocks.bitmap.close.mock.callCount(), 1);
});

test('rejects encoder output whose declared MIME does not match its bytes', async (context) => {
    const mocks = codecs(context, (canvas) => new Blob([png(canvas.width, canvas.height)], { type: 'image/jpeg' }));
    await assert.rejects(optimizeImage(largeFile), /read safely/);
    assert.equal(mocks.bitmap.close.mock.callCount(), 1);
});

test('accepts an encoded result exactly at the upload limit', async (context) => {
    codecs(context, (canvas) => png(canvas.width, canvas.height, { padding: MAX_UPLOAD_BYTES - 69 }));
    assert.equal((await optimizeImage(largeFile)).size, MAX_UPLOAD_BYTES);
});

test('unsupported decoding APIs produce a manual-resize fallback', async (context) => {
    replaceGlobal(context, 'createImageBitmap', undefined);
    await assert.rejects(optimizeImage(largeFile), /browser cannot optimize/);
});

test('a missing canvas context fails and releases the decoded bitmap', async (context) => {
    const mocks = codecs(context, (canvas) => png(canvas.width, canvas.height));
    mocks.canvas.getContext = () => null;
    await assert.rejects(optimizeImage(largeFile), /read safely/);
    assert.equal(mocks.bitmap.close.mock.callCount(), 1);
});

test('a decode rejection fails without returning a prepared file', async (context) => {
    replaceGlobal(context, 'createImageBitmap', async () => { throw new Error('Could not decode image'); });
    await assert.rejects(optimizeImage(largeFile), /Could not decode image/);
});

test('cancellation after an export discards the result and frees image resources', async (context) => {
    const controller = new AbortController();
    const mocks = codecs(context, (canvas) => {
        controller.abort();
        return png(canvas.width, canvas.height);
    });
    await assert.rejects(optimizeImage(largeFile, { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(mocks.bitmap.close.mock.callCount(), 1);
    assert.equal(mocks.canvas.width, 0);
});
