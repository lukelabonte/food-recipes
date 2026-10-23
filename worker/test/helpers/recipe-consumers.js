import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

// Exercise the existing browser closures without adding dependencies or production exports.
const recipeScript = readFileSync(new URL('../../../assets/recipe.js', import.meta.url), 'utf8');
const shoppingScript = readFileSync(new URL('../../../assets/shopping-list.js', import.meta.url), 'utf8');
const shoppingContext = vm.createContext({});
vm.runInContext(shoppingScript.slice(shoppingScript.indexOf('    var FRAC_MAP'),
    shoppingScript.indexOf('    // --- Smart merge ---')), shoppingContext);
export const parseIngredient = (text) => shoppingContext.parseIngredient(text);
vm.runInContext(shoppingScript.slice(shoppingScript.indexOf('    // --- Smart merge ---'),
    shoppingScript.indexOf('    // --- Store section categorization ---')), shoppingContext);
export const mergeIngredients = (items) => shoppingContext.mergeIngredients(items);
vm.runInContext(shoppingScript.slice(shoppingScript.indexOf('    // --- Display formatting ---'),
    shoppingScript.indexOf('    // --- DOM helper:')), shoppingContext);
export const formatItemDisplay = (item) => shoppingContext.formatItemDisplay(item);

export function indexIngredients(html) {
    const result = spawnSync('python3', ['-c',
        'import json, sys; from scripts.generate_search_index import RecipeParser; ' +
        'parser = RecipeParser(); parser.feed(sys.stdin.read()); print(json.dumps(parser.ingredients))'
    ], { input: html, encoding: 'utf8', cwd: new URL('../../../', import.meta.url),
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    return JSON.parse(result.stdout);
}

function element(text = '') {
    const attributes = new Map();
    return {
        textContent: text, childNodes: [], style: {}, listeners: {},
        classList: { add() {}, remove() {} },
        setAttribute(name, value) { attributes.set(name, String(value)); },
        getAttribute(name) { return attributes.get(name) ?? null; },
        hasAttribute(name) { return attributes.has(name); },
        appendChild(child) { this.childNodes.push(child); child.parentNode = this; },
        insertBefore(child) { child.parentNode = this; },
        addEventListener(name, callback) { this.listeners[name] = callback; },
        querySelector() { return null; }
    };
}

function labelledValue(label, value) {
    const node = element();
    const strong = element(label);
    node.lastChild = { nodeType: 3, textContent: ' ' + value };
    Object.defineProperty(node, 'textContent', { get: () => label + node.lastChild.textContent });
    node.querySelector = (selector) => selector === 'strong' ? strong : null;
    return node;
}

export function scaler(ingredientTexts, options = {}) {
    const ingredients = ingredientTexts.map((text) => {
        const node = element();
        node.childNodes = [{ nodeType: 3, textContent: text }];
        return node;
    });
    const ingredientList = { querySelectorAll: () => ingredients };
    const heading = element();
    heading.parentNode = element();
    const servings = labelledValue('Servings', '8');
    const weights = (options.weights || [['Uncooked', '~488 g'], ['Cooked', '~480 g'], ['Per Serving', '~60 g']])
        .map(([label, value]) => labelledValue(label, value));
    const nutritionSource = element('Estimated · Per serving (based on 8 servings)');
    const nutritionValues = element('10 calories; 1 g protein');
    const created = [];
    const document = {
        querySelectorAll: (selector) => {
            if (selector === '.meta-list li') return [servings];
            if (selector === '.ingredient-list > li') return ingredients;
            if (selector === '.weight-list li') return weights;
            return [];
        },
        querySelector: (selector) => ({ '#ingredients h2': heading, '.nutrition-source': nutritionSource, '.nutrition-list': nutritionValues })[selector],
        createElement() { const node = element(); created.push(node); return node; }
    };
    const scalingSource = recipeScript.slice(recipeScript.indexOf('    // --- Recipe scaling ---'),
        recipeScript.indexOf('// --- Step tracking ---'));
    vm.runInNewContext('(function() {\n' + scalingSource, { document, ingredientList, updateScrollPadding: null }, { timeout: 1000 });
    return {
        click(label, times) {
            const button = created.find(node => node.getAttribute('aria-label') === label);
            for (let index = 0; index < times; index++) button.listeners.click();
        },
        texts: () => ingredients.map(node => node.childNodes[0].textContent),
        weights: () => weights.map(node => node.lastChild.textContent.trim()),
        contextNote: () => created.find(node => node.className === 'scale-context-note'),
        nutritionSource, nutritionValues
    };
}
