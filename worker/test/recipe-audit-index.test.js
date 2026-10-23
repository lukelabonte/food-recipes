import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indexIngredients } from './helpers/recipe-consumers.js';

test('generated search data matches ingredients from all 42 current recipe pages', () => {
    const recipes = JSON.parse(readFileSync(new URL('../../assets/recipes.json', import.meta.url), 'utf8'));
    assert.equal(recipes.length, 42);
    for (const recipe of recipes) {
        const html = readFileSync(new URL('../../' + recipe.url, import.meta.url), 'utf8');
        assert.deepEqual(recipe.ingredients, indexIngredients(html), recipe.url);
    }
});

test('search and index timing include the onions mandatory refrigeration', () => {
    const recipes = JSON.parse(readFileSync(new URL('../../assets/recipes.json', import.meta.url), 'utf8'));
    const onions = recipes.find(recipe => recipe.url === 'sauces-and-dressings/quick-pickled-red-onions.html');
    assert.equal(onions.timeMinutes, 1455);
    assert.match(onions.time, /plus cooling/);
    const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    assert.ok(index.includes(onions.time));
});
