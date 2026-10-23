/** Deterministic upload boundary; this does not interpret arbitrary recipe prose. */
import { slugify } from './github.js';

const CATEGORIES = new Set([
    'appetizers', 'beverages', 'breakfast', 'desserts', 'main-dishes', 'salads',
    'sauces-and-dressings', 'side-dishes', 'snacks', 'soups-and-stews'
]);
const FRACTIONS = { '½': 1/2, '⅓': 1/3, '⅔': 2/3, '¼': 1/4, '¾': 3/4,
    '⅕': 1/5, '⅖': 2/5, '⅗': 3/5, '⅘': 4/5, '⅙': 1/6, '⅚': 5/6,
    '⅛': 1/8, '⅜': 3/8, '⅝': 5/8, '⅞': 7/8 };
const QUANTITY = `(?:\\d+[${Object.keys(FRACTIONS).join('')}]|[${Object.keys(FRACTIONS).join('')}]|\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?)`;
const LEADING_RANGE = new RegExp(`^(\\s*)(${QUANTITY})(?:\\s+to\\s+|\\s*[–—-]\\s*)(${QUANTITY})(?=\\s+\\S)([\\s\\S]*)$`, 'i');
const LEADING_QUANTITY = new RegExp(`^\\s*(${QUANTITY})(?=\\s|\\(|$)`);
const UNNORMALIZED_RANGE = new RegExp(`^\\s*${QUANTITY}(?:\\s+to\\s+|\\s*—\\s*)${QUANTITY}`, 'i');

function invalid(field) {
    throw new Error(`Invalid extracted recipe: ${field}`);
}

function object(value, keys, field) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${field} must be an object`);
    if (Object.keys(value).some(key => !keys.includes(key))) invalid(`${field} has unsupported fields`);
}

function string(value, field) {
    if (typeof value !== 'string' || !value.trim()) invalid(`${field} must be a nonempty string`);
}

function optionalString(value, field) {
    if (value !== undefined && value !== null) string(value, field);
}

function array(value, field, nonempty = false) {
    if (!Array.isArray(value) || (nonempty && !value.length)) invalid(`${field} must be ${nonempty ? 'a nonempty' : 'an'} array`);
}

function quantityValue(text) {
    const fraction = FRACTIONS[text.at(-1)];
    if (fraction) return (Number(text.slice(0, -1)) || 0) + fraction;
    const match = text.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
    return match ? Number(match[1] || 0) + Number(match[2]) / Number(match[3]) : Number(text);
}

function normalizeRange(text) {
    const match = text.match(LEADING_RANGE);
    // A leading dimension is not a count range. Leave it for source review.
    if (!match || /^\s*(?:inch(?:es)?|in\.?|cm|mm)\b/i.test(match[4])) return text;
    const lower = quantityValue(match[2]);
    const upper = quantityValue(match[3]);
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower <= 0 || upper <= lower) {
        invalid('ingredient range must have positive, increasing endpoints');
    }
    // Already-supported separators and all remaining source detail stay unchanged.
    if (!/\bto\b|—/i.test(match[0].slice(0, -match[4].length))) return text;
    return `${match[1]}${match[2]}-${match[3]}${match[4]}`;
}

export function validateSourceUrl(value) {
    optionalString(value, 'sourceUrl');
    if (value == null) return;
    let url;
    try { url = new URL(value); } catch { invalid('sourceUrl must be an HTTP(S) URL'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
        invalid('sourceUrl must be an HTTP(S) URL without credentials');
    }
}

// Only compare single, explicitly gram-denominated values. Ranges/other units remain review work.
function grams(value) {
    const match = value?.match(/^\s*~?\s*(\d[\d,]*(?:\.\d+)?)\s*g\s*$/);
    return match ? Number(match[1].replaceAll(',', '')) : null;
}

function checkUnit(value, unit, field) {
    // Detect clear unit/sign mistakes, not uncertainty, ranges, or prose assumptions.
    const match = value.match(/^\s*~?\s*(-?\d[\d,]*(?:\.\d+)?)\s*(g|mg|kg|oz|lb)\s*$/i);
    if (match && (Number(match[1].replaceAll(',', '')) < 0 || match[2].toLowerCase() !== unit)) {
        invalid(`${field} must use nonnegative ${unit}`);
    }
}

export function validateRecipeData(recipe) {
    object(recipe, ['title', 'subtitle', 'category', 'prepTime', 'cookTime', 'totalTime',
        'servings', 'method', 'ingredients', 'steps', 'tips', 'nutrition', 'weight',
        'sourceUrl', 'sourceName', 'photoPrompt'], 'recipe');
    for (const field of ['title', 'subtitle', 'category', 'prepTime', 'cookTime', 'totalTime', 'method']) {
        string(recipe[field], field);
    }
    if (!slugify(recipe.title)) invalid('title must produce a usable filename');
    if (!CATEGORIES.has(recipe.category)) invalid('category is not supported');
    // The existing scaler reads integer servings; never silently truncate or choose a yield.
    if (!Number.isSafeInteger(recipe.servings) || recipe.servings <= 0) invalid('servings must be a positive integer');
    validateSourceUrl(recipe.sourceUrl);
    optionalString(recipe.sourceName, 'sourceName');
    optionalString(recipe.photoPrompt, 'photoPrompt');

    array(recipe.ingredients, 'ingredients', true);
    const ingredients = recipe.ingredients.map((ingredient, index) => {
        const field = `ingredients[${index}]`;
        object(ingredient, ['text', 'grams', 'substitutions'], field);
        string(ingredient.text, `${field}.text`);
        optionalString(ingredient.grams, `${field}.grams`);
        if (ingredient.grams) checkUnit(ingredient.grams, 'g', `${field}.grams`);
        if (ingredient.substitutions !== undefined) {
            array(ingredient.substitutions, `${field}.substitutions`);
            ingredient.substitutions.forEach(substitution => {
                object(substitution, ['name', 'note'], `${field}.substitution`);
                string(substitution.name, `${field}.substitution.name`);
                string(substitution.note, `${field}.substitution.note`);
            });
        }
        const text = normalizeRange(ingredient.text);
        const leading = text.match(LEADING_QUANTITY);
        if (leading && (!Number.isFinite(quantityValue(leading[1])) || quantityValue(leading[1]) <= 0)) {
            invalid(`${field}.text has an invalid quantity`);
        }
        return { ...ingredient, text };
    });
    array(recipe.steps, 'steps', true);
    recipe.steps.forEach(step => string(step, 'step'));
    if (recipe.tips !== undefined) {
        array(recipe.tips, 'tips');
        recipe.tips.forEach(tip => {
            object(tip, ['title', 'text'], 'tip');
            string(tip.title, 'tip.title');
            string(tip.text, 'tip.text');
        });
    }
    if (recipe.nutrition != null) {
        const nutrition = recipe.nutrition;
        object(nutrition, ['calories', 'protein', 'fat', 'carbs', 'saturatedFat', 'cholesterol',
            'sodium', 'potassium', 'fiber', 'sugars', 'source'], 'nutrition');
        if (typeof nutrition.calories !== 'number' || !Number.isFinite(nutrition.calories) || nutrition.calories < 0) {
            invalid('nutrition.calories must be a nonnegative finite number');
        }
        for (const field of ['protein', 'fat', 'carbs', 'source']) string(nutrition[field], `nutrition.${field}`);
        for (const [field, value] of Object.entries(nutrition)) {
            if (field === 'calories' || field === 'source') continue;
            optionalString(value, `nutrition.${field}`);
            if (value) checkUnit(value, ['cholesterol', 'sodium', 'potassium'].includes(field) ? 'mg' : 'g', `nutrition.${field}`);
        }
    }
    if (recipe.weight != null) {
        object(recipe.weight, ['uncooked', 'cooked', 'perServing', 'method'], 'weight');
        for (const field of ['uncooked', 'cooked', 'perServing', 'method']) string(recipe.weight[field], `weight.${field}`);
        for (const field of ['uncooked', 'cooked', 'perServing']) checkUnit(recipe.weight[field], 'g', `weight.${field}`);
    }

    const tips = [...(recipe.tips || [])];
    function review(text) {
        if (!tips.some(tip => tip.title === 'Review source data' && tip.text === text)) {
            tips.push({ title: 'Review source data', text });
        }
    }
    if (ingredients.some(ingredient => UNNORMALIZED_RANGE.test(ingredient.text) ||
        (!LEADING_QUANTITY.test(ingredient.text) && !LEADING_RANGE.test(ingredient.text)))) {
        review('Some ingredient amounts are unspecified or not mechanically scalable. Preserve the source amounts; confirm quantities before shopping.');
    }
    const cooked = grams(recipe.weight?.cooked);
    const perServing = grams(recipe.weight?.perServing);
    if (cooked !== null && perServing !== null) {
        const servingTotal = perServing * recipe.servings;
        // Rounding and ordinary cooking estimates are not contradictions. A larger mismatch
        // may still reflect different inclusions, so warn without rewriting or rejecting.
        if (Math.abs(cooked - servingTotal) > Math.max(20, Math.max(cooked, servingTotal) * 0.15)) {
            review('Cooked batch weight and per-serving weight × servings differ substantially. Confirm the serving basis and whether buns, optional toppings, or discarded cooking liquid are included; estimates have not been corrected.');
        }
    }
    return { ...recipe, ingredients, ...(tips.length ? { tips } : {}) };
}
