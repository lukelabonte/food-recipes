export const validRecipe = {
    title: 'Test Soup', subtitle: 'A simple soup.', category: 'soups-and-stews',
    prepTime: '5 min', cookTime: '10 min', totalTime: '15 min', servings: 8,
    method: 'Stovetop',
    ingredients: [{ text: '2 cups broth', grams: '~488 g' }],
    steps: ['Simmer the broth.'], tips: [],
    nutrition: { calories: 10, protein: '1 g', fat: '0 g', carbs: '1 g', source: 'Estimated from ingredients; broth only.' },
    weight: { uncooked: '~488 g', cooked: '~480 g', perServing: '~60 g', method: 'Estimated evaporation; broth only.' },
    sourceUrl: null, sourceName: null, photoPrompt: 'A bowl of broth.'
};

export const beerBrats = {
    ...validRecipe, title: 'Beer Brats', category: 'main-dishes',
    ingredients: [
        { text: '1 to 2 packages bratwurst', grams: null },
        { text: '4 to 6 cans beer', grams: null },
        { text: '8 buns', grams: null },
        { text: 'Sauerkraut (optional), for serving', grams: null },
        { text: 'Mustard (optional), for serving', grams: null }
    ],
    steps: ['Simmer brats in beer. Discard cooking liquid. Serve eight sandwiches, each with one bun; optionally add sauerkraut and mustard.'],
    tips: [{ title: 'Source uncertainty', text: 'Package sizes and optional topping amounts are not specified.' }],
    nutrition: null, weight: null
};
