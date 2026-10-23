/** Evidence is model-reported. A literal quote match is not semantic verification. */
const STATUSES = new Set(['stated', 'inferred', 'estimated', 'unknown']);
const SOURCES = new Set(['text', 'urlContent', 'notes', 'attachment']);

function fieldsFor(recipe) {
    return new Map([
        ['/servings', String(recipe.servings)],
        ...recipe.ingredients.flatMap((ingredient, index) => [
            [`/ingredients/${index}/text`, ingredient.text],
            [`/ingredients/${index}/grams`, ingredient.grams ?? 'Unknown grams']
        ]),
        ['/nutrition', recipe.nutrition ? 'Per-serving nutrition' : 'Not provided'],
        ['/weight', recipe.weight ? 'Batch and per-serving weights' : 'Not provided']
    ]);
}

function invalid(message) {
    throw new Error(`Invalid extracted recipe: evidence ${message}`);
}

function shape(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).some(key => !keys.includes(key))) invalid('has an unsupported shape');
}

export function validateEvidence(recipe) {
    if (recipe.evidence === undefined) return; // Existing recipes and saved responses remain usable.
    if (!Array.isArray(recipe.evidence)) invalid('must be an array');
    const fields = fieldsFor(recipe);
    const covered = new Set();
    recipe.evidence.forEach(entry => {
        shape(entry, ['field', 'status', 'sources', 'note']);
        if (!fields.has(entry.field) || covered.has(entry.field)) invalid('must reference a unique existing recipe field');
        covered.add(entry.field);
        if (!STATUSES.has(entry.status)) invalid('has an unsupported status');
        if (typeof entry.note !== 'string' || !entry.note.trim()) invalid('needs an explanation');
        if (!Array.isArray(entry.sources) || (!entry.sources.length && entry.status !== 'unknown')) invalid('needs source excerpts');
        entry.sources.forEach(source => {
            shape(source, ['source', 'quote']);
            if (!SOURCES.has(source.source) || typeof source.quote !== 'string' || !source.quote.trim()) invalid('needs a source kind and nonempty quote');
        });
    });
}

export function buildExtractionReview(recipe, input = {}) {
    const fields = fieldsFor(recipe);
    const supplied = new Map((recipe.evidence || []).map(entry => [entry.field, entry]));
    const issues = [];
    const missing = [...fields.keys()].filter(field => !supplied.has(field));
    if (missing.length) issues.push(`Source evidence is missing for: ${missing.join(', ')}.`);
    const evidence = [...fields].map(([field, value]) => {
        const entry = supplied.get(field);
        if (!entry) return { field, value, status: 'unreported', sources: [], note: 'No evidence supplied.' };
        const ingredientGrams = field.match(/^\/ingredients\/(\d+)\/grams$/);
        const absent = (field === '/nutrition' && recipe.nutrition == null) ||
            (field === '/weight' && recipe.weight == null) ||
            (ingredientGrams && recipe.ingredients[Number(ingredientGrams[1])].grams == null);
        if (absent && entry.status !== 'unknown') issues.push(`${field}: value is missing but evidence labels it ${entry.status}; confirm the classification.`);
        if (entry.status !== 'stated') issues.push(`${field}: ${entry.status}. ${entry.note}`);
        const sources = entry.sources.map(source => {
            let check;
            if (source.source === 'attachment') check = input.imageBase64 ? 'model-reported' : 'unavailable';
            else if (typeof input[source.source] !== 'string' || !input[source.source]) check = 'unavailable';
            else check = input[source.source].includes(source.quote) ? 'literal-match' : 'not-found';
            if (check === 'unavailable' || check === 'not-found') issues.push(`${field}: source excerpt ${check === 'not-found' ? 'not found as a literal match (formatting may differ)' : 'unavailable'} in ${source.source}.`);
            if (check === 'model-reported') issues.push(`${field}: attachment excerpt is model-reported, not independently checked.`);
            return { ...source, check };
        });
        return { ...entry, value, sources };
    });
    return {
        issues: [...new Set(issues)], evidence,
        notes: [
            ...(recipe.tips || []).map(tip => `${tip.title}: ${tip.text}`),
            ...(recipe.nutrition ? [`Nutrition basis: ${recipe.nutrition.source}`] : ['Nutrition not provided.']),
            ...(recipe.weight ? [`Weight basis: ${recipe.weight.method}`] : ['Weight estimates not provided.'])
        ]
    };
}

export function escapeReviewText(value) {
    return String(value).replace(/\s+/g, ' ').trim()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/@/g, '&#64;')
        .replace(/[\\`*_[\]{}()|#!~]/g, '\\$&');
}

export function renderReviewMarkdown(report) {
    if (!report) report = { issues: ['Source evidence was not supplied.'], notes: [], evidence: [] };
    return [
        '## Review before merging', '',
        'Evidence and classifications are model-reported. A literal excerpt match is not semantic, quantity, nutrition, or external-source verification.', '',
        ...(report.issues.length ? report.issues.map(issue => `- ${escapeReviewText(issue)}`) :
            ['No mechanical review flags. Source interpretation still needs human review.']), '',
        '### Extraction notes and assumptions (model-reported)', '',
        ...report.notes.map(note => `- ${escapeReviewText(note)}`), '',
        '<details>', '<summary>Source evidence</summary>', '',
        '| Field and value | Basis (model) | Excerpts and checks | Explanation |',
        '| --- | --- | --- | --- |',
        ...report.evidence.map(entry => `| ${escapeReviewText(entry.field)}: ${escapeReviewText(entry.value)} | ${escapeReviewText(entry.status)} | ${entry.sources.map(source =>
            `${escapeReviewText(source.source)} [${escapeReviewText(source.check)}]: ${escapeReviewText(source.quote)}`).join('<br>') || 'No excerpt'} | ${escapeReviewText(entry.note)} |`),
        '', '</details>'
    ].join('\n');
}
