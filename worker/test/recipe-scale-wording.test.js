import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const recipe = path => readFileSync(new URL(path, root), 'utf8');
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function section(html, identifier) {
    const match = html.match(new RegExp(`<div[^>]* id="${identifier}">([\\s\\S]*?)</div>`));
    assert.ok(match, `Missing ${identifier}`);
    return text(match[1]);
}

const stepCases = [
    ['desserts/basic-vanilla-pudding.html', [/five-sixths of the listed milk/, /remaining one-sixth of the milk/], /2½ cups|remaining ½ cup/],
    ['main-dishes/mapo-tofu.html', [/half of the listed oil/, /remaining oil/], /¼ cup of (?:the )?oil/],
    ['main-dishes/pailins-authentic-pad-thai.html', [/half of the listed oil/, /remaining oil/, /three-fifths of the listed bean sprouts/, /remaining bean sprouts/], /1½ tablespoons of oil|1½ cups of the bean sprouts|remaining 1 cup/],
    ['main-dishes/chicken-breast-casserole.html', [/Arrange the listed chicken breasts/], /the 4 chicken breasts/],
    ['desserts/white-chocolate-cranberry-oatmeal-cookies.html', [/beat the eggs together/], /the 2 eggs/],
    ['soups-and-stews/jamies-minestrone-soup.html', [/listed olive oil for cooking/, /reserving the drizzling oil for serving/], /Heat 3 tablespoons/],
    ['side-dishes/orvilles-spanish-rice.html', [/Heat the listed olive oil/], /Heat 1\/4 cup/],
    ['salads/moms-potato-salad.html', [/place the listed eggs/, /Reserve one-fifth of the hard-boiled eggs for topping/, /remaining four-fifths/, /reserved egg slices/], /the 5 eggs|slice 4 of|remaining hard-boiled egg/],
    ['main-dishes/orvilles-enchiladas.html', [/with all the tortillas/], /all 12 tortillas/],
    ['appetizers/bacon-apple-jalape-o-pop-ems.html', [/Halve all the jalapeños lengthwise/], /all 20 jalapeños/],
    ['main-dishes/french-boulangerie-style-pizza.html', [/individual thick 13–15 cm \(5–6 inch\) rounds/, /four rounds at the original four-serving yield/], /Divide the dough into 4 pieces/],
    ['snacks/peanut-butter-balls.html', [/balls, roughly 1½ inches each/], /about 24 balls/],
    ['side-dishes/moms-bbq-beans.html', [/combine the listed pork and beans/], /all three cans/],
    ['main-dishes/almond-delight.html', [/Add the listed dry chicken noodle soup mix/], /both packages/],
    ['appetizers/glazed-meatballs.html', [/Add the listed chili sauce and grape jelly/], /both jars|entire jar/]
];

for (const [path, expected, stale] of stepCases) {
    test(`${path}: steps reference scaled ingredients and preserve allocations`, () => {
        const steps = section(recipe(path), 'steps');
        for (const pattern of expected) assert.match(steps, pattern);
        assert.doesNotMatch(steps, stale);
    });
}

const substitutionCases = [
    ['breakfast/blueberry-muffins.html', [/Vegetable oil: 1:1 by volume with the listed butter/, /2% milk: 1:1 with the listed whole milk/, /Milk and sour cream: mix 2 parts milk with 1 part sour cream to reach the listed milk volume/]],
    ['desserts/basic-vanilla-pudding.html', [/add 1 tbsp extra flour per 3 cups of listed milk/, /Cornstarch: 2½ tbsp per ⅓ cup of listed flour/]],
    ['salads/moms-potato-salad.html', [/Greek yogurt: 1:1 with the listed salad dressing; blend in 1 tsp sugar and 1 tsp vinegar per cup of listed dressing/]],
    ['appetizers/glazed-meatballs.html', [/Ketchup mixed with hot sauce: 1:1 with the listed chili sauce; use 1 tsp hot sauce per 24 oz of listed chili sauce/]],
    ['appetizers/uncle-larrys-cheese-bread-beer-dip.html', [/Kosher salt and garlic powder: equal parts, totaling the listed garlic salt volume/]],
    ['side-dishes/orvilles-spanish-rice.html', [/Kosher salt: 1.5 times the listed salt volume/, /Diced canned tomatoes \+ diced green chiles: 1:1 combined; the original batch uses 1 small can of green chiles/]],
    ['appetizers/rotel-tomato-cheese-dip.html', [/Canned diced tomatoes \+ diced green chiles: 1:1 combined; the original batch uses 1 \(4 oz\) can of green chiles/]],
    ['soups-and-stews/jamies-minestrone-soup.html', [/Balsamic vinegar \+ water: 1 tbsp vinegar per ½ cup of listed red wine; original-batch water amount unspecified/]]
];

for (const [path, expected] of substitutionCases) {
    test(`${path}: substitutions express verified ratios or identify original-batch limits`, () => {
        for (const pattern of expected) assert.match(section(recipe(path), 'ingredients'), pattern);
    });
}

test('verified ratios preserve the original amounts at half, base, and double batches', () => {
    for (const scale of [0.5, 1, 2]) {
        assert.equal(3 * scale * 5 / 6, 2.5 * scale);
        assert.equal(3 * scale / 6, 0.5 * scale);
        assert.equal(2.5 * scale * 3 / 5, 1.5 * scale);
        assert.equal(2.5 * scale * 2 / 5, 1 * scale);
        assert.equal(0.75 * scale * 2 / 3, 0.5 * scale);
        assert.equal(0.75 * scale / 3, 0.25 * scale);
        assert.equal((1 / 3) * scale * (2.5 / (1 / 3)), 2.5 * scale);
        assert.equal(1.5 * scale * 1.5, 2.25 * scale);
        assert.equal(0.5 * scale * 3, 1.5 * scale);
        assert.equal(2 * scale * 1, 2 * scale);
    }
});

test('primary ingredient references avoid stale totals without changing gram estimates', () => {
    assert.match(recipe('desserts/banana-chocolate-chip-bars.html'), /1 cup mashed ripe banana \(about 2 medium bananas per cup\) <span class="ingredient-grams">\(225 g\)/);
    assert.match(recipe('main-dishes/almond-delight.html'), /0\.5 cup white rice \(or three times the listed white-rice amount when omitting wild rice\) <span class="ingredient-grams">\(~95 g \(standard version\)\)/);
    assert.match(recipe('desserts/white-chocolate-cranberry-oatmeal-cookies.html'), /1 stick \(1\/2 cup\) unsalted butter/);
    assert.match(recipe('main-dishes/pailins-authentic-pad-thai.html'), /¼ cup shallots, thinly sliced <span class="ingredient-grams">\(35 g\)/);
});

test('key lime zest has a leading count in the actual search-index parser', () => {
    const html = recipe('desserts/key-lime-pie.html');
    assert.match(html, /1 lime, zest only <span class="ingredient-grams">\(6 g\)/);
    const result = spawnSync('python3', ['-c',
        'import json, sys; from scripts.generate_search_index import RecipeParser; ' +
        'parser = RecipeParser(); parser.feed(sys.stdin.read()); print(json.dumps(parser.ingredients))'
    ], { input: html, encoding: 'utf8', cwd: root,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    assert.ok(JSON.parse(result.stdout).includes('1 lime, zest only'));
});

test('pancake substitute and tip preserve one tablespoon acid per cup of total replacement', () => {
    const html = recipe('breakfast/buttermilk-pancakes.html');
    assert.match(section(html, 'ingredients'), /2 cups buttermilk/);
    assert.match(section(html, 'ingredients'), /Lemon juice: 1 tablespoon per cup of buttermilk being replaced; add milk to reach the listed buttermilk volume; let sit 5 min/);
    assert.match(section(html, 'tips'), /1 tablespoon of lemon juice or white vinegar per cup of buttermilk being replaced, then add whole milk to reach the listed buttermilk volume/);
});

test('ham soup broth uses the listed water volume and keeps the strength warning', () => {
    const ingredients = section(recipe('soups-and-stews/delicious-ham-and-potato-soup.html'), 'ingredients');
    assert.match(ingredients, /3 1\/4 cups water/);
    assert.match(ingredients, /Chicken broth: use the listed water volume and omit bouillon/);
    assert.match(ingredients, /Broth strength and sodium vary; season to taste before adding salt or more bouillon/);
    assert.match(ingredients, /Better Than Bouillon — 2 tsp/);
});
