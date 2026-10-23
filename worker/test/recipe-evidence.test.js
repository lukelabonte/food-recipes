import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRecipe } from '../src/extract.js';
import { buildExtractionReview, renderReviewMarkdown } from '../src/recipe-evidence.js';
import { validRecipe } from './fixtures/recipe.js';

const input = { text: 'Serves 8. Use 2 cups broth. Simmer the broth.', notes: 'No toppings.' };
const entry = (field, status = 'stated', source = 'text', quote = input.text) => ({
    field, status, sources: [{ source, quote }], note: 'Source basis for this field.'
});
const recipe = {
    ...validRecipe,
    evidence: [entry('/servings'), entry('/ingredients/0/text'),
        entry('/ingredients/0/grams', 'estimated'), entry('/nutrition', 'estimated'), entry('/weight', 'estimated')]
};

test('checks literal source presence without claiming semantic or nutritional verification', () => {
    const report = buildExtractionReview(recipe, input);
    assert.equal(report.evidence[0].sources[0].check, 'literal-match');
    assert.ok(report.issues.some(issue => /estimated/i.test(issue)));
    const markdown = renderReviewMarkdown(report);
    assert.match(markdown, /Review before merging/);
    assert.match(markdown, /literal.*not.*semantic/i);
    assert.match(markdown, /Estimated from ingredients/);
    assert.match(markdown, /Estimated evaporation/);
    assert.match(markdown, /model-reported/i);
    assert.ok(!markdown.includes('USDA verified'));
    assert.deepEqual(buildExtractionReview(recipe, input), report);
});

test('an unmatched quote or missing channel is a nonblocking review issue, not silently verified', () => {
    const report = buildExtractionReview({ ...recipe, evidence: [
        entry('/servings', 'stated', 'text', 'Serves 12.'),
        entry('/ingredients/0/text', 'stated', 'urlContent', '2 cups broth')
    ] }, input);
    assert.equal(report.evidence[0].sources[0].check, 'not-found');
    assert.equal(report.evidence[1].sources[0].check, 'unavailable');
    assert.match(report.issues.join('\n'), /not found|unavailable/i);
    assert.match(report.issues.join('\n'), /missing/i);
});

test('attachment quotes remain model-reported and an absent attachment is unavailable', () => {
    const attachmentRecipe = { ...recipe, evidence: [entry('/servings', 'stated', 'attachment', 'Serves 8.')] };
    assert.equal(buildExtractionReview(attachmentRecipe, { imageBase64: 'synthetic' }).evidence[0].sources[0].check, 'model-reported');
    assert.equal(buildExtractionReview(attachmentRecipe, {}).evidence[0].sources[0].check, 'unavailable');
});

test('legacy recipes are accepted but their provenance is explicitly missing in review', () => {
    const report = buildExtractionReview(validRecipe, input);
    assert.match(report.issues.join('\n'), /missing/i);
    assert.ok(report.evidence.every(evidence => evidence.status === 'unreported'));
});

test('a missing value mislabeled as stated is flagged without inventing a replacement', () => {
    const missing = { ...recipe, weight: null, ingredients: [{ text: '2 cups broth', grams: null }],
        evidence: [entry('/weight'), entry('/ingredients/0/grams')] };
    const report = buildExtractionReview(missing, input);
    assert.equal(report.issues.filter(issue => /value is missing but evidence labels it stated/.test(issue)).length, 2);
    assert.equal(missing.weight, null);
    assert.equal(missing.ingredients[0].grams, null);
});

test('inferred bun counts and unknown amounts are visible rather than described as copied facts', () => {
    const report = buildExtractionReview({ ...validRecipe, ingredients: [
        { text: '8 buns', grams: null }, { text: 'Mustard (optional)', grams: null }
    ], evidence: [entry('/ingredients/0/text', 'inferred'),
        { field: '/ingredients/1/text', status: 'unknown', sources: [], note: 'Mustard amount unspecified.' }] }, input);
    assert.match(report.issues.join('\n'), /inferred/i);
    assert.match(report.issues.join('\n'), /unknown/i);
    assert.match(renderReviewMarkdown(report), /Mustard amount unspecified/);
});

test('untrusted evidence, tips and nutrition prose cannot introduce PR headings, HTML or mentions', () => {
    const hostile = '\n# Approved\n<script>alert(1)</script> | @everyone [click](javascript:alert(1))';
    const report = buildExtractionReview({ ...recipe,
        tips: [{ title: hostile, text: hostile }],
        nutrition: { ...recipe.nutrition, source: hostile },
        evidence: [{ ...entry('/servings', 'inferred', 'notes', hostile), note: hostile }]
    }, { notes: hostile });
    const markdown = renderReviewMarkdown(report);
    assert.ok(!markdown.includes('\n# Approved'));
    assert.ok(!markdown.includes('<script>'));
    assert.ok(!markdown.includes('@everyone'));
    assert.ok(!markdown.includes('[click](javascript:'));
    assert.match(markdown, /&lt;script/);
});

test('extraction accepts valid evidence and retains literal source excerpts', async context => {
    context.mock.method(globalThis, 'fetch', async () => Response.json({ content: [{ type: 'text', text: JSON.stringify(recipe) }] }));
    assert.deepEqual(await extractRecipe('test-only-key', input), recipe);
});

for (const [name, evidence] of [
    ['non-array', {}], ['null', null], ['null entry', [null]],
    ['wrong target', [entry('/ingredients/99/text')]],
    ['unknown status', [entry('/servings', 'verified')]],
    ['duplicate target', [entry('/servings'), entry('/servings')]],
    ['unknown source', [entry('/servings', 'stated', 'system')]],
    ['fake verification', [{ ...entry('/servings'), sources: [{ source: 'text', quote: input.text, verified: true }] }]],
    ['missing source', [{ ...entry('/servings'), sources: [] }]],
    ['missing note', [{ ...entry('/servings'), note: '' }]]
]) {
    test(`rejects malformed evidence before rendering: ${name}`, async context => {
        context.mock.method(globalThis, 'fetch', async () => Response.json({ content: [{ type: 'text', text: JSON.stringify({ ...validRecipe, evidence }) }] }));
        await assert.rejects(extractRecipe('test-only-key', input), /Invalid extracted recipe: evidence/);
    });
}
