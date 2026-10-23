import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const recipes = new Map();

function recipe(path) {
    if (!recipes.has(path)) {
        const html = readFileSync(new URL(path, root), 'utf8');
        const result = spawnSync('python3', ['-c',
            'import json, sys; from scripts.generate_search_index import RecipeParser, parse_time_minutes; ' +
            'parser = RecipeParser(); parser.feed(sys.stdin.read()); ' +
            'print(json.dumps(dict(ingredients=parser.ingredients, time=parser.time, ' +
            'timeMinutes=parse_time_minutes(parser.time), servings=parser.servings)))'
        ], { input: html, encoding: 'utf8', cwd: root,
            env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
        assert.equal(result.status, 0, result.error?.message || result.stderr);
        recipes.set(path, { html, ...JSON.parse(result.stdout) });
    }
    return recipes.get(path);
}

function text(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function section(html, identifier) {
    const match = html.match(new RegExp(`<div[^>]* id="${identifier}">([\\s\\S]*?)</div>`));
    assert.ok(match, `Missing ${identifier} section`);
    return text(match[1]);
}

function gramTotals(html) {
    return [...html.matchAll(/class="ingredient-grams">\(~?([\d.]+)(?:–([\d.]+))? g[^<]*<\/span>/g)]
        .reduce(([minimum, maximum], match) => [minimum + Number(match[1]),
            maximum + Number(match[2] || match[1])], [0, 0]);
}

test('casserole weight range follows listed grams and an explicit estimated 20% loss', () => {
    const { html, servings } = recipe('main-dishes/chicken-broccoli-rice-casserole.html');
    const totals = gramTotals(html);
    assert.deepEqual(totals, [2350, 2441]);
    assert.equal(servings, '6');
    const weights = section(html, 'weight');
    const format = value => value.toLocaleString('en-US');
    const cooked = totals.map(value => Math.round(value * 0.8));
    const portions = totals.map(value => Math.round(value * 0.8 / 6));
    assert.ok(weights.includes(`Uncooked ~${format(totals[0])}–${format(totals[1])} g`));
    assert.ok(weights.includes(`Cooked ~${format(cooked[0])}–${format(cooked[1])} g`));
    assert.ok(weights.includes(`Per Serving ~${portions[0]}–${portions[1]} g`));
    assert.match(weights, /including optional seasonings/i);
    assert.match(weights, /estimated 20%/i);
    assert.match(weights, /not (?:a )?measured yield/i);
});

test('taco bake totals and per-serving weights retain the original 15–20% loss range', () => {
    const { html, servings } = recipe('main-dishes/speedy-taco-bake.html');
    assert.deepEqual(gramTotals(html), [2082, 2082]);
    assert.equal(servings, '8–10');
    const weights = section(html, 'weight');
    assert.match(weights, /Uncooked ~2,082 g/);
    const cooked = [0.8, 0.85].map(multiplier => Math.round(2082 * multiplier).toLocaleString('en-US'));
    const portions = [0.8, 0.85].map(multiplier => Math.round(2082 * multiplier / 8));
    assert.ok(weights.includes(`Cooked ~${cooked.join('–')} g`));
    assert.ok(weights.includes(`Per Serving ~${portions.join('–')} g`));
    assert.match(weights, /original estimated 15–20%/i);
    assert.match(weights, /8 servings/);
    assert.match(section(html, 'nutrition'), /based on 8 servings/);
});

test('onion active time and total ready-to-eat time include refrigeration and cooling', () => {
    const { html, time, timeMinutes } = recipe('sauces-and-dressings/quick-pickled-red-onions.html');
    assert.match(section(html, 'overview'), /Active 15 min/);
    assert.match(time, /At least 24 hr 15 min, plus cooling/);
    assert.equal(timeMinutes, 1455);
    assert.match(section(html, 'steps'), /cool to room temperature, then cover and refrigerate for at least 1 day before eating/);
    const description = html.match(/property="og:description" content="([^"]*)"/)[1];
    assert.match(description, /15 min active/);
    assert.match(description, /at least 24 hr 15 min, plus cooling/);
});

test('pancake substitute makes two cups total without changing primary buttermilk', () => {
    const { html, ingredients } = recipe('breakfast/buttermilk-pancakes.html');
    assert.ok(ingredients.includes('2 cups buttermilk'));
    const substitute = text(html.match(/<span class="sub-name">([^<]*lemon juice[^<]*)<\/span>/i)[1]);
    assert.match(substitute, /1 tablespoon per cup of buttermilk/i);
    assert.match(substitute, /(?:reach|make|match) (?:the )?listed buttermilk (?:amount|volume)/i);
    assert.match(substitute, /let sit 5 min/);
    assert.match(section(html, 'tips'), /1 tablespoon (?:of )?(?:lemon juice|acid).*per cup/i);
});

test('ham soup broth substitute replaces all water and omits bouillon without asserting strength equivalence', () => {
    const { html, ingredients } = recipe('soups-and-stews/delicious-ham-and-potato-soup.html');
    assert.ok(ingredients.includes('3 1/4 cups water'));
    assert.ok(ingredients.includes('2 tablespoons chicken bouillon granules'));
    const substitute = text(html.match(/<span class="sub-name">([^<]*chicken broth[^<]*)<\/span>\s*<span class="sub-note">([^<]*)<\/span>/i)[0]);
    assert.match(substitute, /listed water (?:amount|volume)/i);
    assert.match(substitute, /omit (?:the )?bouillon/i);
    assert.doesNotMatch(substitute, /1:1/);
    assert.match(substitute, /season to taste/i);
});

const servingCases = [
    ['main-dishes/speedy-taco-bake.html', ['Sour cream, for serving', 'Chopped tomato, for serving', 'Shredded lettuce, for serving'], /excluding serving accompaniments/i],
    ['appetizers/championship-bean-dip.html', ['Tortilla chips, for serving', 'Salsa, for serving'], /chips and serving salsa (?:not included|excluded)/i],
    ['appetizers/orvilles-chili-con-queso.html', ['Tortilla chips, for serving'], /(?:not including|excluding) tortilla chips/i],
    ['main-dishes/barbecue-ice-cream-social.html', ['Hamburger buns, for serving'], /(?:no bun|excluding (?:hamburger )?buns)/i]
];

for (const [path, additions, exclusion] of servingCases) {
    test(`${path}: unquantified serving items are indexed and excluded from baseline estimates`, () => {
        const { html, ingredients } = recipe(path);
        for (const addition of additions) {
            assert.ok(ingredients.includes(addition), `Missing indexed ingredient: ${addition}`);
            assert.ok(html.includes(`<li>${addition}</li>`), 'Serving items must have no invented quantities or weights');
        }
        assert.match(section(html, 'nutrition'), exclusion);
        assert.match(section(html, 'weight'), exclusion);
    });
}

test('all eight corrected recipes preserve the existing nutrition values', () => {
    const expected = [
        ['main-dishes/chicken-broccoli-rice-casserole.html', ['~615', '~35.5 g', '~32.5 g', '~46 g']],
        ['main-dishes/speedy-taco-bake.html', ['~450', '~22 g', '~24 g', '~36 g']],
        ['sauces-and-dressings/quick-pickled-red-onions.html', ['30', '0.5 g', '0 g', '7 g']],
        ['breakfast/buttermilk-pancakes.html', ['123', '4 g', '3 g', '20 g']],
        ['soups-and-stews/delicious-ham-and-potato-soup.html', ['195', '6.1 g', '19.5 g', '10.5 g']],
        ['appetizers/championship-bean-dip.html', ['220', '10 g', '14 g', '13 g']],
        ['appetizers/orvilles-chili-con-queso.html', ['210', '7 g', '18 g', '5 g']],
        ['main-dishes/barbecue-ice-cream-social.html', ['370', '23 g', '22 g', '18 g']]
    ];
    for (const [path, values] of expected) {
        const { html } = recipe(path);
        const actual = [...html.matchAll(/<li data-macro="[^"]+"><strong>[^<]+<\/strong> ([^<]+)<\/li>/g)]
            .map(match => match[1]);
        assert.deepEqual(actual, values, path);
    }
});
