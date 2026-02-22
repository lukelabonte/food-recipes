/**
 * Recipe JSON -> HTML renderer.
 * Produces HTML structurally identical to existing recipe pages.
 */

const CATEGORY_EMOJI = {
    'appetizers': '&#x1F362;',      // 🍢
    'beverages': '&#x1F964;',       // 🥤
    'breakfast': '&#x1F373;',       // 🍳
    'desserts': '&#x1F370;',        // 🍰
    'main-dishes': '&#x1F37D;&#xFE0F;', // 🍽️
    'salads': '&#x1F957;',          // 🥗
    'sauces-and-dressings': '&#x1FAD9;', // 🫙
    'side-dishes': '&#x1F958;',     // 🥘
    'snacks': '&#x1F37F;',          // 🍿
    'soups-and-stews': '&#x1F372;'  // 🍲
};

// Raw emoji characters for favicon SVG (needs actual emoji, not HTML entities)
const CATEGORY_EMOJI_RAW = {
    'appetizers': '\u{1F362}',
    'beverages': '\u{1F964}',
    'breakfast': '\u{1F373}',
    'desserts': '\u{1F370}',
    'main-dishes': '\u{1F37D}\u{FE0F}',
    'salads': '\u{1F957}',
    'sauces-and-dressings': '\u{1FAD9}',
    'side-dishes': '\u{1F958}',
    'snacks': '\u{1F37F}',
    'soups-and-stews': '\u{1F372}'
};

/**
 * Escape HTML special characters.
 */
function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Render a single ingredient <li>, including substitution markup if present.
 */
function renderIngredient(ingredient) {
    const hasSubs = ingredient.substitutions && ingredient.substitutions.length > 0;
    const dataSubs = hasSubs ? ' data-subs' : '';
    const gramsSpan = ingredient.grams
        ? ` <span class="ingredient-grams">(${esc(ingredient.grams)})</span>`
        : '';

    let subMarkup = '';
    if (hasSubs) {
        const subItems = ingredient.substitutions.map(sub =>
            `                        <li>
                            <span class="sub-name">${esc(sub.name)}</span>
                            <span class="sub-note">${esc(sub.note)}</span>
                        </li>`
        ).join('\n');

        subMarkup = `
                    <ul class="sub-list" hidden>
${subItems}
                    </ul>`;
    }

    return `                <li${dataSubs}>${esc(ingredient.text)}${gramsSpan}${subMarkup}
                </li>`;
}

/**
 * Render the complete recipe HTML page.
 *
 * @param {object} recipe - Extracted recipe JSON
 * @param {object} meta - Additional metadata
 * @param {string} meta.contributor - Display name of the person who submitted
 * @param {string} meta.slug - URL slug for the recipe
 * @returns {string} Complete HTML document
 */
export function renderRecipeHTML(recipe, meta) {
    const category = recipe.category || 'main-dishes';
    const emoji = CATEGORY_EMOJI_RAW[category] || CATEGORY_EMOJI_RAW['main-dishes'];
    const slug = meta.slug;

    // Determine which nav pills to include
    const hasTips = recipe.tips && recipe.tips.length > 0;
    const hasNutrition = recipe.nutrition;
    const hasWeight = recipe.weight;

    const navPills = [
        '<a href="#overview" class="recipe-nav-pill">Overview</a>',
        '<a href="#ingredients" class="recipe-nav-pill">Ingredients</a>',
        '<a href="#steps" class="recipe-nav-pill">Steps</a>',
        ...(hasTips ? ['<a href="#tips" class="recipe-nav-pill">Tips</a>'] : []),
        ...(hasNutrition ? ['<a href="#nutrition" class="recipe-nav-pill">Nutrition</a>'] : []),
        ...(hasWeight ? ['<a href="#weight" class="recipe-nav-pill">Weight</a>'] : [])
    ];

    // Build ingredients list
    const ingredientItems = recipe.ingredients.map(renderIngredient).join('\n');

    // Build steps
    const stepItems = recipe.steps.map(step =>
        `                <li>${esc(step)}</li>`
    ).join('\n');

    // Build tips section
    let tipsSection = '';
    if (hasTips) {
        const tipItems = recipe.tips.map(tip =>
            `                <li><strong>${esc(tip.title)}</strong> ${esc(tip.text)}</li>`
        ).join('\n');
        tipsSection = `
        <div class="card tips-card" id="tips">
            <h2>Tips</h2>
            <ul>
${tipItems}
            </ul>
        </div>`;
    }

    // Build nutrition section
    let nutritionSection = '';
    if (hasNutrition) {
        const n = recipe.nutrition;
        const nutritionItems = [
            `                <li data-macro="calories"><strong>Calories</strong> ${esc(String(n.calories))}</li>`,
            `                <li data-macro="protein"><strong>Protein</strong> ${esc(n.protein)}</li>`,
            `                <li data-macro="fat"><strong>Fat</strong> ${esc(n.fat)}</li>`,
            `                <li data-macro="carbs"><strong>Carbs</strong> ${esc(n.carbs)}</li>`,
            ...(n.saturatedFat ? [`                <li><strong>Sat. Fat</strong> ${esc(n.saturatedFat)}</li>`] : []),
            ...(n.cholesterol ? [`                <li><strong>Cholesterol</strong> ${esc(n.cholesterol)}</li>`] : []),
            ...(n.sodium ? [`                <li><strong>Sodium</strong> ${esc(n.sodium)}</li>`] : []),
            ...(n.potassium ? [`                <li><strong>Potassium</strong> ${esc(n.potassium)}</li>`] : []),
            ...(n.fiber ? [`                <li><strong>Fiber</strong> ${esc(n.fiber)}</li>`] : []),
            ...(n.sugars ? [`                <li><strong>Sugars</strong> ${esc(n.sugars)}</li>`] : [])
        ];

        const sourceText = n.source || 'Estimated';
        nutritionSection = `
        <div class="card" id="nutrition">
            <h2>Nutrition Facts</h2>
            <ul class="nutrition-list">
${nutritionItems.join('\n')}
            </ul>
            <p class="nutrition-source">${esc(sourceText)} &middot; Per serving (based on ${esc(String(recipe.servings))} servings)</p>
        </div>`;
    }

    // Build weight section
    let weightSection = '';
    if (hasWeight) {
        const w = recipe.weight;
        weightSection = `
        <div class="card weight-card" id="weight">
            <h2>Weight Estimates</h2>
            <ul class="weight-list">
                <li><strong>Uncooked</strong> ${esc(w.uncooked)}</li>
                <li><strong>Cooked</strong> ${esc(w.cooked)}</li>
                <li><strong>Per Serving</strong> ${esc(w.perServing)}</li>
            </ul>
            <p class="method">${esc(w.method)}</p>
        </div>`;
    }

    // Build source attribution
    let attribution = '';
    if (recipe.sourceUrl && recipe.sourceName) {
        attribution = `
        <p class="recipe-attribution">
            Source: <a href="${esc(recipe.sourceUrl)}" target="_blank" rel="noopener">${esc(recipe.sourceName)}</a>
            <span class="contributor"> &middot; By ${esc(meta.contributor)}</span>
        </p>`;
    } else {
        attribution = `
        <p class="recipe-attribution">
            <span class="contributor">By ${esc(meta.contributor)}</span>
        </p>`;
    }

    // OG image URL (will be generated by deploy workflow)
    const ogImageUrl = `https://copyandpastry.com/assets/thumbnails/${esc(slug)}.png`;
    const ogPageUrl = `https://copyandpastry.com/${esc(category)}/${esc(slug)}`;
    const ogDescription = `${esc(recipe.subtitle)} ${recipe.servings} servings &middot; ${esc(recipe.totalTime)}.`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(recipe.title)}</title>
    <link rel="stylesheet" href="../assets/style.css">
    <style>.recipe { max-width: 640px; margin: 0 auto; }</style>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${emoji}</text></svg>">
    <meta property="og:title" content="${esc(recipe.title)}">
    <meta property="og:description" content="${esc(recipe.subtitle)} ${recipe.servings} servings \u00B7 ${esc(recipe.totalTime)}.">
    <meta property="og:type" content="article">
    <meta property="og:image" content="${ogImageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${ogPageUrl}">
    <script src="../assets/recipe.js" defer></script>
    <script src="../assets/theme.js" defer></script>
</head>
<body>
    <div class="recipe">

        <div class="nav-bar">
            <a href="../" class="back-link">\u2190 All Recipes</a>
            <button class="print-btn" onclick="window.print()" aria-label="Print recipe">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.25 7.28H5.75" />
                </svg>
            </button>
        </div>

        <div class="card header-card">
            <h1>${esc(recipe.title)}</h1>
            <p class="subtitle">${esc(recipe.subtitle)}</p>
        </div>

        <nav class="recipe-nav">
            ${navPills.join('\n            ')}
        </nav>

        <div class="card" id="overview">
            <ul class="meta-list">
                <li><strong>Prep</strong> ${esc(recipe.prepTime)}</li>
                <li><strong>Cook</strong> ${esc(recipe.cookTime)}</li>
                <li><strong>Total</strong> ${esc(recipe.totalTime)}</li>
                <li><strong>Servings</strong> ${esc(String(recipe.servings))}</li>
                <li><strong>Method</strong> ${esc(recipe.method)}</li>
            </ul>
        </div>

        <div class="card" id="ingredients">
            <h2>Ingredients</h2>
            <ul class="ingredient-list">
${ingredientItems}
            </ul>
        </div>

        <div class="card steps-card" id="steps">
            <h2>Steps</h2>
            <ol>
${stepItems}
            </ol>
        </div>
${tipsSection}
${nutritionSection}
${weightSection}
${attribution}

        <a href="../" class="back-link">\u2190 All Recipes</a>

    </div>
</body>
</html>
`;
}
