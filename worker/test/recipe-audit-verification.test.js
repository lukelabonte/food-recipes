import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const [path, grams] of [
    ['salads/moms-potato-salad.html', '1,700'],
    ['soups-and-stews/moms-chili.html', '790'],
    ['soups-and-stews/nanas-fish-chowder.html', '850']
]) {
    test(`${path}: gross package conversion isn't presented as verified drained mass`, () => {
        const html = readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
        assert.ok(html.includes(`(~${grams} g packaged; drained weight unverified)`));
        const nutrition = html.match(/<p class="nutrition-source">([^<]+)<\/p>/)[1];
        const method = html.match(/<p class="method">([^<]+)<\/p>/)[1];
        assert.match(nutrition, /drained (?:potato|bean) (?:mass|weight) (?:is )?unverified/i);
        assert.match(method, /provisional/i);
        assert.match(method, /drained (?:potato|bean) (?:mass|weight)/i);
    });
}

test('chowder nutrition is explicitly flagged rather than adjusted to an unidentified butter product', () => {
    const html = readFileSync(new URL('../../soups-and-stews/nanas-fish-chowder.html', import.meta.url), 'utf8');
    assert.match(html, /42 g fat conflicts with the listed butter amount under an ordinary-butter assumption/);
    assert.match(html, /(?:not|isn't) suitable for dietary tracking until recalculated/i);
    assert.match(html, /1 cup butter, divided/);
    assert.match(html, /\(~225 g\)/);
});

test('chicken yield no longer claims incompatible measured bone and cooking losses', () => {
    const html = readFileSync(new URL('../../main-dishes/gochujang-chicken.html', import.meta.url), 'utf8');
    const method = html.match(/<p class="method">([^<]+)<\/p>/)[1];
    assert.match(method, /unverified edible-yield estimates/i);
    assert.match(method, /uncooked weight includes bones/i);
    assert.doesNotMatch(method, /28%|30%/);
    assert.match(html, /~780 g/);
    assert.match(html, /~195 g/);
});
