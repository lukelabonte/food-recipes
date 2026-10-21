import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRecipe } from '../src/extract.js';

const recipe = { title: 'Test Soup', ingredients: [], steps: ['Simmer.'] };
const recipeJson = JSON.stringify(recipe);
const input = { text: 'Synthetic recipe input' };

function stubResponse(context, content) {
    return context.mock.method(globalThis, 'fetch', async () => new Response(
        JSON.stringify({ content }),
        { status: 200 }
    ));
}

test('selects Sonnet 5.5 for recipe extraction', async (context) => {
    const fetchMock = stubResponse(context, [{ type: 'text', text: recipeJson }]);

    assert.deepEqual(await extractRecipe('test-only-key', input), recipe);
    const request = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
    assert.equal(request.model, 'claude-sonnet-5-5');
});

test('preserves no up-front thinking with the supported setting', async (context) => {
    const fetchMock = stubResponse(context, [{ type: 'text', text: recipeJson }]);

    await extractRecipe('test-only-key', input);
    const request = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
    assert.deepEqual(request.thinking, { type: 'between_tools' });
    assert.equal(request.output_config, undefined);
});

test('extracts JSON from text after a thinking block', async (context) => {
    stubResponse(context, [
        { type: 'thinking', thinking: '', signature: 'test-signature' },
        { type: 'text', text: recipeJson }
    ]);

    assert.deepEqual(await extractRecipe('test-only-key', input), recipe);
});

for (const [name, content] of [
    ['missing content', undefined],
    ['empty content', []],
    ['thinking only', [{ type: 'thinking', thinking: '', signature: 'test-signature' }]],
    ['redacted thinking only', [{ type: 'redacted_thinking', data: 'test-data' }]],
    ['empty text', [{ type: 'text', text: '' }]],
    ['whitespace text', [{ type: 'text', text: ' \n\t ' }]]
]) {
    test(`reports an intentional empty-response error for ${name}`, async (context) => {
        stubResponse(context, content);

        await assert.rejects(extractRecipe('test-only-key', input), {
            name: 'Error',
            message: 'Empty response from extraction model'
        });
    });
}

for (const [name, text] of [
    ['plain JSON', ` \n${recipeJson}\n `],
    ['JSON markdown fence', `\`\`\`json\n${recipeJson}\n\`\`\``],
    ['unlabelled markdown fence', `\`\`\`\n${recipeJson}\n\`\`\``],
    ['fence with surrounding prose', `Result:\n\`\`\`json\n${recipeJson}\n\`\`\`\nDone.`]
]) {
    test(`accepts ${name}`, async (context) => {
        stubResponse(context, [{ type: 'text', text }]);

        assert.deepEqual(await extractRecipe('test-only-key', input), recipe);
    });
}

test('reads all text blocks while ignoring non-text content', async (context) => {
    stubResponse(context, [
        { type: 'redacted_thinking', data: 'test-data' },
        { type: 'text', text: '' },
        { type: 'text', text: '{"title":"Test Soup",' },
        { type: 'thinking', thinking: '', signature: 'test-signature' },
        { type: 'text', text: '"ingredients":[],"steps":["Simmer."]}' }
    ]);

    assert.deepEqual(await extractRecipe('test-only-key', input), recipe);
});

for (const text of ['not JSON', '```json\nnot JSON\n```', '```json\n\n```']) {
    test(`keeps the extraction parse error for ${JSON.stringify(text)}`, async (context) => {
        stubResponse(context, [{ type: 'text', text }]);

        await assert.rejects(extractRecipe('test-only-key', input), (error) => {
            assert.equal(error.name, 'Error');
            assert.match(error.message, /^Failed to parse extraction result as JSON: /);
            assert.ok(error.message.endsWith(`\nRaw: ${text.includes('not JSON') ? 'not JSON' : ''}`));
            return true;
        });
    });
}

test('preserves the Messages request and text, URL content, and notes inputs', async (context) => {
    const fetchMock = stubResponse(context, [{ type: 'text', text: recipeJson }]);

    await extractRecipe('test-only-key', {
        text: 'Synthetic recipe input',
        urlContent: 'Synthetic source content',
        notes: 'Synthetic contributor notes'
    });

    const [endpoint, options] = fetchMock.mock.calls[0].arguments;
    assert.equal(endpoint, 'https://api.anthropic.com/v1/messages');
    assert.equal(options.method, 'POST');
    assert.deepEqual(options.headers, {
        'Content-Type': 'application/json',
        'x-api-key': 'test-only-key',
        'anthropic-version': '2023-06-01'
    });
    const request = JSON.parse(options.body);
    assert.equal(request.max_tokens, 4096);
    assert.deepEqual(Object.keys(request).sort(), ['max_tokens', 'messages', 'model', 'thinking']);
    assert.equal(request.messages.length, 1);
    assert.equal(request.messages[0].role, 'user');
    const content = request.messages[0].content;
    assert.equal(content.length, 1);
    assert.equal(content[0].type, 'text');
    assert.ok(content[0].text.endsWith(
        '\n\n---\n\nRecipe text:\nSynthetic recipe input' +
        '\n\n---\n\nContent from source URL:\nSynthetic source content' +
        '\n\n---\n\nAdditional notes from the contributor:\nSynthetic contributor notes'
    ));
});

for (const [name, imageBase64, type, mediaType] of [
    ['raw JPEG', 'dGVzdA==', 'image', 'image/jpeg'],
    ['JPEG data URL', 'data:image/jpeg;base64,dGVzdA==', 'image', 'image/jpeg'],
    ['PNG data URL', 'data:image/png;base64,dGVzdA==', 'image', 'image/png'],
    ['PDF data URL', 'data:application/pdf;base64,dGVzdA==', 'document', 'application/pdf']
]) {
    test(`preserves ${name} input alongside recipe text`, async (context) => {
        const fetchMock = stubResponse(context, [{ type: 'text', text: recipeJson }]);

        await extractRecipe('test-only-key', { ...input, imageBase64 });

        const request = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
        const content = request.messages[0].content;
        assert.equal(content.length, 2);
        assert.deepEqual(content[0], {
            type,
            source: { type: 'base64', media_type: mediaType, data: 'dGVzdA==' }
        });
        assert.equal(content[1].type, 'text');
        assert.ok(content[1].text.endsWith('\n\n---\n\nRecipe text:\nSynthetic recipe input'));
    });
}

test('keeps HTTP errors with a bounded response excerpt', async (context) => {
    context.mock.method(globalThis, 'fetch', async () => new Response('x'.repeat(600), { status: 429 }));

    await assert.rejects(extractRecipe('test-only-key', input), {
        name: 'Error',
        message: `Anthropic API error (429): ${'x'.repeat(500)}`
    });
});

test('keeps non-JSON API errors with a bounded response excerpt', async (context) => {
    context.mock.method(globalThis, 'fetch', async () => new Response('x'.repeat(400), { status: 200 }));

    await assert.rejects(extractRecipe('test-only-key', input), {
        name: 'Error',
        message: `Anthropic API returned non-JSON (200): ${'x'.repeat(300)}`
    });
});
