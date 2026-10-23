import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { parseIngredient, mergeIngredients, formatItemDisplay, indexIngredients, scaler } from './helpers/recipe-consumers.js';

test('weight scaling preserves ranges, edible scope, and exact source text on return', () => {
    const weights = [
        ['Uncooked', '~2,350–2,441 g (including optional seasonings)'],
        ['Cooked', '~1,000 g (brats and onion, drained)'],
        ['Per Serving', '~125 g (excluding bun)']
    ];
    const scaling = scaler(['2 cups broth'], { weights });
    scaling.click('Increase servings', 8);
    assert.deepEqual(scaling.weights(), [
        '~4,700–4,882 g (including optional seasonings)',
        '~2,000 g (brats and onion, drained)',
        '~125 g (excluding bun)'
    ]);
    scaling.click('Decrease servings', 8);
    assert.deepEqual(scaling.weights(), weights.map(([, value]) => value));
});

test('ingredient equivalent measures scale without changing per-package sizes or dimensions', () => {
    const scaling = scaler([
        '1 cup (4 oz) shredded cheese',
        '1 stick (½ cup) butter',
        '2 (12-ounce) cans beer',
        '1 (10–12 ounce) package noodles',
        '2 carrots, cut into 1-inch pieces'
    ]);
    scaling.click('Increase servings', 8);
    assert.deepEqual(scaling.texts(), [
        '2 cup (8 oz) shredded cheese',
        '2 stick (1 cup) butter',
        '4 (12-ounce) cans beer',
        '2 (10–12 ounce) package noodles',
        '4 carrots, cut into 1-inch pieces'
    ]);
});

test('shopping merge keeps differently sized packages separate but merges matching sizes', () => {
    const inputs = ['1 can (15 oz) tomatoes', '2 cans (28 oz) tomatoes', '3 cans (15 oz) tomatoes'];
    const items = inputs.map((text, index) => ({ ...parseIngredient(text), source: `Recipe ${index}` }));
    const merged = mergeIngredients(items);
    assert.equal(merged.length, 2);
    assert.deepEqual(Array.from(merged, item => item.qty), [4, 2]);
    assert.match(merged[0].displayName, /15 oz/);
    assert.match(merged[1].displayName, /28 oz/);
});

test('shopping merge preserves size parentheses after the food name and strips only prep', () => {
    const items = ['1 can tomatoes (15 oz), diced', '1 can tomatoes (28 oz), diced']
        .map(text => ({ ...parseIngredient(text), source: 'Recipe' }));
    assert.equal(mergeIngredients(items).length, 2);
    const same = ['1 cup flour, sifted', '2 cups flour, divided']
        .map(text => ({ ...parseIngredient(text), source: 'Recipe' }));
    assert.equal(mergeIngredients(same).length, 1);
    assert.equal(mergeIngredients(same)[0].qty, 3);
});

for (const inputs of [['4–6 cans tomatoes', '2 cans tomatoes'], ['2 cans tomatoes', '4–6 cans tomatoes']]) {
    test(`shopping merges complete quantity intervals: ${inputs.join(' + ')}`, () => {
        const merged = mergeIngredients(inputs.map(text => ({ ...parseIngredient(text), source: 'Recipe' })));
        assert.equal(merged.length, 1);
        assert.equal(merged[0].qty, 6);
        assert.equal(merged[0].qty2, 8);
    });
}

test('shopping merge keeps comma-suffixed per-can sizes and product descriptions', () => {
    const items = ['2 cans sweetened condensed milk, 14 oz each', '1 can sweetened condensed milk, 12 oz each']
        .map(text => ({ ...parseIngredient(text), source: 'Recipe' }));
    assert.equal(mergeIngredients(items).length, 2);
});

test('ingredient scaling returns exact ASCII fractions, spacing and original precision', () => {
    const original = ['  1/2 cup (4 oz) cheese  ', '1 1/2 cups flour'];
    const scaling = scaler(original);
    scaling.click('Increase servings', 8);
    scaling.click('Decrease servings', 8);
    assert.deepEqual(scaling.texts(), original);
});

test('weight component gram amounts scale but non-weight qualifiers do not', () => {
    const weights = [['Uncooked', '~654 g (454 g Velveeta + 200 g drained tomatoes; 15 oz can)']];
    const scaling = scaler(['1 can tomatoes'], { weights });
    scaling.click('Increase servings', 8);
    assert.deepEqual(scaling.weights(), ['~1,308 g (908 g Velveeta + 400 g drained tomatoes; 15 oz can)']);
    scaling.click('Decrease servings', 8);
    assert.deepEqual(scaling.weights(), [weights[0][1]]);
});

test('both extraction instructions require ingredient-relative batch quantities', () => {
    for (const path of ['../src/extract.js', '../../docs/claude-web-instructions.md']) {
        const instructions = readFileSync(new URL(path, import.meta.url), 'utf8');
        assert.match(instructions, /Keep steps, tips, alternatives, and substitutions scale-safe/);
        assert.match(instructions, /Keep per-item formulas, temperatures, durations, dimensions, and package sizes fixed/);
    }
});

test('scaled views identify any remaining original-batch prose without scaling temperatures or times', () => {
    const scaling = scaler(['2 cups broth']);
    assert.equal(scaling.contextNote().hidden, true);
    scaling.click('Increase servings', 8);
    assert.equal(scaling.contextNote().hidden, false);
    assert.match(scaling.contextNote().textContent, /original 8 servings/);
    assert.match(scaling.contextNote().textContent, /Keep times, temperatures, dimensions, and per-item formulas unchanged/);
    scaling.click('Decrease servings', 8);
    assert.equal(scaling.contextNote().hidden, true);
});

test('existing-recipe browser fixture parses and restricts loading to loopback resources', () => {
    const html = readFileSync(new URL('./browser/recipe-scaling.html', import.meta.url), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    assert.doesNotThrow(() => new Script(script, { filename: 'recipe-scaling.html' }));
    assert.match(html, /connect-src 'self'/);
    assert.match(script, /Loopback origin required/);
    assert.match(script, /AbortSignal\.timeout\(8000\)/);
    assert.match(script, /cache: 'no-store'/);
    assert.doesNotMatch(script, /localStorage\.setItem/);
});

test('merged quantity intervals pluralize from the upper endpoint', () => {
    const merged = mergeIngredients(['½ cup flour', '½–1½ cups flour']
        .map(text => ({ ...parseIngredient(text), source: 'Recipe' })));
    assert.equal(formatItemDisplay(merged[0]), '1–2 cups flour');
    assert.equal(formatItemDisplay(parseIngredient('1 cup flour')), '1 cup flour');
});

test('casserole chicken alternatives retain their source relationship when the batch changes', () => {
    const html = readFileSync(new URL('../../main-dishes/chicken-broccoli-rice-casserole.html', import.meta.url), 'utf8');
    const chicken = indexIngredients(html).find(text => /rotisserie chicken/.test(text));
    assert.match(chicken, /1 cup per (?:listed )?breast/);
    assert.doesNotMatch(chicken, /or 2 cups/);
    const scaling = scaler([chicken]);
    scaling.click('Increase servings', 8);
    assert.match(scaling.texts()[0], /^4 boneless/);
    assert.match(scaling.texts()[0], /1 cup per (?:listed )?breast/);
    scaling.click('Decrease servings', 8);
    assert.deepEqual(scaling.texts(), [chicken]);
});
