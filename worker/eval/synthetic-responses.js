// Explicitly fabricated model outputs for testing the harness, not model-quality evidence.
import { attachmentLines, cases } from './cases.js';

const outputs = [
    {
        title: 'Beer Brats', servings: 8,
        ingredients: ['1-2 packages bratwurst', '4-6 cans beer', '8 buns', 'Mustard (optional), for serving', 'Sauerkraut (optional), for serving'],
        steps: ['Simmer the bratwurst in beer, drain and discard beer. Serve 8 sandwiches, one bun each, with optional mustard and sauerkraut.'],
        tips: ['Infer 8 buns from 8 sandwiches with one bun each.', 'Package sizes and optional topping amounts are unspecified.']
    },
    {
        title: 'Tomato Flatbread', servings: 4,
        ingredients: ['1/2-1 1/2 cups flour', '2 (14-ounce) cans crushed tomatoes', '½ teaspoon salt'],
        steps: ['Mix and bake 20 minutes.'], tips: ['Flour varies with moisture.']
    },
    {
        title: 'Lentil Soup', servings: 8,
        ingredients: ['10 cups broth', '2 cups dry lentils'],
        steps: ['Simmer 30 minutes.'],
        tips: ['Original yield is 8–10 servings.', 'Scaling uses 8 standard bowls as specified in contributor notes.']
    },
    {
        title: 'Rice Pot', servings: 4,
        ingredients: ['2 cups dry rice (directions say 3 cups; conflict unresolved)', '3 cups water'],
        steps: ['The source lists 2 cups rice but directs 3 cups dry rice. Confirm before simmering with 3 cups water.'],
        tips: ['Source conflict: the list says 2 cups dry rice; directions say 3 cups dry rice. Neither is confirmed.']
    },
    {
        title: 'Carrot Soup', servings: 2,
        ingredients: ['2 carrots', '1 cup water'],
        steps: ['Simmer carrots in water and blend.'], tips: []
    },
    {
        title: 'Synthetic Typed Pea Soup', servings: 2,
        ingredients: ['2 cups frozen peas', '1 cup water'],
        steps: ['Simmer peas in water for 5 minutes. Blend and serve.'], tips: []
    }
];

export function syntheticRecipe(fixture) {
    const index = cases.findIndex(item => item.id === fixture.id);
    if (index < 0) throw new Error('Unknown synthetic fixture');
    const output = outputs[index];
    const evidence = (field, status = 'stated') => {
        let source = fixture.expected.attachment ? 'attachment' : 'text';
        let quote = fixture.input.text;
        if (fixture.expected.attachment) {
            const ingredient = field.match(/^\/ingredients\/(\d+)\//);
            quote = ingredient ? attachmentLines[Number(ingredient[1]) + 2] :
                field === '/servings' ? 'Serves 2.' : attachmentLines.at(-1);
        } else if (index === 2 && field === '/servings') {
            source = 'notes';
            quote = fixture.input.notes;
        }
        return {
            field, status, sources: [{ source, quote }],
            note: status === 'unknown' ? 'Not supplied or estimated in this synthetic output.' : 'Synthetic test evidence, not a model observation.'
        };
    };
    return {
        title: output.title, subtitle: 'A synthetic evaluation recipe.', category: [2, 4, 5].includes(index) ? 'soups-and-stews' : 'main-dishes',
        prepTime: 'Not specified', cookTime: 'Not specified', totalTime: 'Not specified', method: index === 1 ? 'Oven' : 'Stovetop',
        servings: output.servings,
        ingredients: output.ingredients.map(text => ({ text, grams: null })),
        steps: output.steps, tips: output.tips.map(text => ({ title: 'Source notes', text })),
        nutrition: null, weight: null, sourceUrl: null, sourceName: null,
        photoPrompt: 'The prepared synthetic dish, without added garnishes.',
        evidence: [
            evidence('/servings', index === 2 ? 'inferred' : 'stated'),
            ...output.ingredients.flatMap((text, ingredientIndex) => [
                evidence(`/ingredients/${ingredientIndex}/text`, index === 0 && ingredientIndex >= 3 ? 'unknown' :
                    index === 0 && ingredientIndex === 2 ? 'inferred' : 'stated'),
                evidence(`/ingredients/${ingredientIndex}/grams`, 'unknown')
            ]),
            evidence('/nutrition', 'unknown'), evidence('/weight', 'unknown')
        ]
    };
}

export function syntheticResponse(fixture) {
    return {
        id: `synthetic-${fixture.id}`, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5',
        content: [{ type: 'text', text: JSON.stringify(syntheticRecipe(fixture)) }],
        stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 200 },
        synthetic: true
    };
}
