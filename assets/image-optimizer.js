import { MAX_UPLOAD_BYTES } from './upload-limits.js';

// Conservative processing bounds, not guarantees about a device's available memory.
// Keep a full 4032 × 3024 phone photo eligible, but reject huge decodes before allocating pixels.
const MAX_INPUT_BYTES = 20_000_000;
const MAX_PIXELS = 12_500_000;
const MAX_INPUT_EDGE = 5400;
const MAX_CANVAS_EDGE = 4096;
const UNSUPPORTED = 'Only non-animated PNG, JPEG, and WebP images can be optimized. Choose a smaller file instead.';
const INVALID = 'This image could not be read safely. Choose a smaller photo or screenshot.';
const TOO_LARGE = 'This image exceeds the safe processing limits. Resize it on your device first.';

function checkCancellation(signal) {
    if (signal?.aborted) throw new DOMException('Image preparation was cancelled.', 'AbortError');
}

function checkDimensions(width, height) {
    if (!width || !height) throw new Error(INVALID);
    if (width > MAX_INPUT_EDGE || height > MAX_INPUT_EDGE || width * height > MAX_PIXELS) {
        throw new Error(TOO_LARGE);
    }
    return { width, height };
}

function tag(bytes, offset, length = 4) {
    return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function pngDimensions(bytes, view) {
    let dimensions;
    let hasImageData = false;
    for (let offset = 8; offset + 12 <= bytes.length;) {
        const length = view.getUint32(offset);
        const end = offset + 12 + length;
        if (end > bytes.length) throw new Error(INVALID);
        const name = tag(bytes, offset + 4);
        if (offset === 8 && (name !== 'IHDR' || length !== 13)) throw new Error(INVALID);
        if (name === 'acTL') throw new Error(UNSUPPORTED);
        if (name === 'IHDR') {
            if (dimensions || length !== 13) throw new Error(INVALID);
            dimensions = checkDimensions(view.getUint32(offset + 8), view.getUint32(offset + 12));
        }
        if (name === 'IDAT') hasImageData = true;
        if (name === 'IEND') {
            if (length !== 0 || end !== bytes.length || !hasImageData) throw new Error(INVALID);
            return dimensions;
        }
        offset = end;
    }
    throw new Error(INVALID);
}

function jpegDimensions(bytes, view) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
        if (bytes[offset++] !== 255) throw new Error(INVALID);
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) break;
        const length = view.getUint16(offset);
        if (length < 2 || offset + length > bytes.length) throw new Error(INVALID);
        const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (isFrame) {
            if (length < 8) throw new Error(INVALID);
            return checkDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
        }
        offset += length;
    }
    throw new Error(INVALID);
}

function webpDimensions(bytes, view) {
    if (view.getUint32(4, true) + 8 !== bytes.length) throw new Error(INVALID);
    let extendedDimensions;
    let imageDimensions;
    const uint24 = (offset) => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
    let offset = 12;
    while (offset + 8 <= bytes.length) {
        const name = tag(bytes, offset);
        const length = view.getUint32(offset + 4, true);
        const start = offset + 8;
        const end = start + length;
        if (end + (length % 2) > bytes.length) throw new Error(INVALID);
        if (name === 'ANIM' || name === 'ANMF') throw new Error(UNSUPPORTED);
        if (name === 'VP8X') {
            if (length !== 10 || extendedDimensions) throw new Error(INVALID);
            if (bytes[start] & 0x02) throw new Error(UNSUPPORTED);
            extendedDimensions = checkDimensions(uint24(start + 4) + 1, uint24(start + 7) + 1);
        }
        if (name === 'VP8 ' || name === 'VP8L') {
            if (imageDimensions) throw new Error(INVALID);
            if (name === 'VP8 ') {
                if (length < 10 || tag(bytes, start + 3, 3) !== '\x9d\x01\x2a') throw new Error(INVALID);
                imageDimensions = checkDimensions(view.getUint16(start + 6, true) & 0x3fff,
                    view.getUint16(start + 8, true) & 0x3fff);
            } else {
                if (length < 5 || bytes[start] !== 0x2f) throw new Error(INVALID);
                const bits = view.getUint32(start + 1, true);
                imageDimensions = checkDimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
            }
        }
        offset = end + (length % 2);
    }
    if (offset !== bytes.length || !imageDimensions) throw new Error(INVALID);
    if (extendedDimensions && (extendedDimensions.width !== imageDimensions.width ||
        extendedDimensions.height !== imageDimensions.height)) throw new Error(INVALID);
    return imageDimensions;
}

/** Inspect bounded source bytes before decoding. Reject animation rather than flattening frames. */
export async function inspectImage(file, { signal } = {}) {
    checkCancellation(signal);
    if (file.size > MAX_INPUT_BYTES) throw new Error(TOO_LARGE);
    const buffer = await file.arrayBuffer();
    checkCancellation(signal);
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let type;
    let dimensions;
    if (bytes.length >= 33 && tag(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') {
        type = 'image/png';
        dimensions = pngDimensions(bytes, view);
    } else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 0xd8) {
        type = 'image/jpeg';
        dimensions = jpegDimensions(bytes, view);
    } else if (bytes.length >= 20 && tag(bytes, 0) === 'RIFF' && tag(bytes, 8) === 'WEBP') {
        type = 'image/webp';
        dimensions = webpDimensions(bytes, view);
    } else {
        throw new Error(UNSUPPORTED);
    }
    return { type, ...dimensions };
}

function encode(canvas, type) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, 0.95));
}

/** Prepare an upload copy. Never change the original, crop, upscale, or run unbounded quality searches. */
export async function optimizeImage(file, { signal } = {}) {
    checkCancellation(signal);
    if (file.size <= MAX_UPLOAD_BYTES) return file;
    const metadata = await inspectImage(file, { signal });
    if (typeof createImageBitmap !== 'function') {
        throw new Error('This browser cannot optimize images. Resize the image on your device first.');
    }
    let bitmap;
    let canvas;
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        checkCancellation(signal);
        checkDimensions(bitmap.width, bitmap.height);
        const matchesDimensions = (bitmap.width === metadata.width && bitmap.height === metadata.height) ||
            (bitmap.width === metadata.height && bitmap.height === metadata.width);
        if (!matchesDimensions) throw new Error(INVALID);
        canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error(INVALID);
        const initialScale = Math.min(1, MAX_CANVAS_EDGE / Math.max(bitmap.width, bitmap.height));
        const scales = [...new Set([initialScale, Math.max(0.75, initialScale * 0.85), 0.75])];
        // At most nine encodes. Small recipe text must not be chased through ever-lower quality settings.
        for (const scale of scales) {
            for (const type of ['image/png', 'image/webp', 'image/jpeg']) {
                checkCancellation(signal);
                canvas.width = Math.floor(bitmap.width * scale);
                canvas.height = Math.floor(bitmap.height * scale);
                if (!canvas.width || !canvas.height) throw new Error(INVALID);
                if (type === 'image/jpeg') {
                    context.fillStyle = '#fff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                }
                context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                const blob = await encode(canvas, type);
                checkCancellation(signal);
                if (!blob || blob.size === 0 || blob.size > MAX_UPLOAD_BYTES) continue;
                const output = await inspectImage(blob, { signal });
                if (output.type !== blob.type || output.width !== canvas.width || output.height !== canvas.height) {
                    throw new Error(INVALID);
                }
                const extension = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[output.type];
                const baseName = file.name.replace(/\.[^.]+$/, '') || 'recipe';
                return new File([blob], `${baseName}-optimized.${extension}`, {
                    type: output.type, lastModified: file.lastModified
                });
            }
        }
        throw new Error('This image could not fit within 7.5 MB without more quality loss. Choose a smaller image or upload recipe text only.');
    } finally {
        bitmap?.close();
        if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
        }
    }
}
