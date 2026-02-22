/**
 * Recipe extraction via Anthropic Messages API.
 * Sends recipe text (and optional URL content / image) to Claude Sonnet
 * and returns structured JSON.
 */

const EXTRACTION_PROMPT = `You are a recipe data extractor. Given the recipe information below, extract and return a JSON object with the following schema. Return ONLY the JSON — no markdown fences, no explanation.

Schema:
{
  "title": "string — recipe title, title case",
  "subtitle": "string — 1-2 sentence appetizing description",
  "category": "string — one of: appetizers, beverages, breakfast, desserts, main-dishes, salads, sauces-and-dressings, side-dishes, snacks, soups-and-stews",
  "prepTime": "string — e.g. '10 min'",
  "cookTime": "string — e.g. '25 min'",
  "totalTime": "string — e.g. '35 min'",
  "servings": "number",
  "method": "string — cooking method, e.g. 'Wok / Stovetop', 'Oven', 'Grill'",
  "ingredients": [
    {
      "text": "string — full ingredient line with amount, e.g. '1 cup flour'",
      "grams": "string or null — metric gram weight, e.g. '120 g'. Estimate if not provided.",
      "substitutions": [
        {
          "name": "string — substitute ingredient + ratio, e.g. 'Almond flour — 1:1'",
          "note": "string — context about flavor, texture, or calorie difference"
        }
      ]
    }
  ],
  "steps": ["string — each step as a complete paragraph"],
  "tips": [
    {
      "title": "string — bold tip heading",
      "text": "string — tip explanation"
    }
  ],
  "nutrition": {
    "calories": "number",
    "protein": "string — e.g. '11 g'",
    "fat": "string — e.g. '29 g'",
    "carbs": "string — e.g. '8 g'",
    "saturatedFat": "string — e.g. '5 g'",
    "cholesterol": "string — e.g. '27 mg'",
    "sodium": "string — e.g. '126 mg'",
    "potassium": "string — e.g. '340 mg'",
    "fiber": "string — e.g. '1 g'",
    "sugars": "string — e.g. '2 g'",
    "source": "string — where the nutrition data came from, e.g. 'Estimated from USDA data'"
  },
  "weight": {
    "uncooked": "string — e.g. '~1,130 g'",
    "cooked": "string — e.g. '~900 g'",
    "perServing": "string — e.g. '~150 g'",
    "method": "string — brief explanation of weight change during cooking"
  },
  "sourceUrl": "string or null — URL of original recipe if known",
  "sourceName": "string or null — site name if from external source, e.g. 'Serious Eats'"
}

Rules:
- Only suggest substitutions that preserve the dish's character.
- Never substitute core identity ingredients (primary protein, defining flavor).
- Substitution ratios are required. Use directional calorie language ("lower calorie") — no exact numbers.
- If no confident substitution exists for an ingredient, omit the substitutions array for that item.
- Estimate gram weights if not explicitly provided.
- Nutrition should be per serving.
- If information is missing, make reasonable estimates and note assumptions.
- tips array can be empty if no useful tips apply.`;

/**
 * Build the message content array for the Anthropic API.
 */
function buildContent(text, urlContent, imageBase64, notes) {
    const parts = [];

    if (imageBase64) {
        // Detect media type from data URL header
        let mediaType = 'image/jpeg';
        let data = imageBase64;
        if (imageBase64.startsWith('data:')) {
            const match = imageBase64.match(/^data:([^;]+);base64,/);
            if (match) {
                mediaType = match[1];
                data = imageBase64.replace(/^data:[^;]+;base64,/, '');
            }
        }

        if (mediaType === 'application/pdf') {
            parts.push({
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data }
            });
        } else {
            parts.push({
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data }
            });
        }
    }

    let textContent = EXTRACTION_PROMPT + '\n\n---\n\nRecipe text:\n' + text;

    if (urlContent) {
        textContent += '\n\n---\n\nContent from source URL:\n' + urlContent;
    }

    if (notes) {
        textContent += '\n\n---\n\nAdditional notes from the contributor:\n' + notes;
    }

    parts.push({ type: 'text', text: textContent });

    return parts;
}

/**
 * Extract the JSON string from the model response, handling possible markdown fences.
 */
function extractJsonFromResponse(result) {
    if (!result.content || result.content.length === 0) {
        throw new Error('Empty response from extraction model');
    }

    let text = result.content[0].text;

    // Strip markdown code fences if present
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
        text = fenceMatch[1];
    }

    return text.trim();
}

/**
 * Call the Anthropic Messages API to extract structured recipe data.
 * @param {string} apiKey
 * @param {{ text: string, urlContent?: string, imageBase64?: string, notes?: string }} input
 * @returns {Promise<object>} Parsed recipe JSON
 */
export async function extractRecipe(apiKey, { text, urlContent, imageBase64, notes }) {
    const content = buildContent(text, urlContent, imageBase64, notes);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            messages: [{ role: 'user', content }]
        })
    });

    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(`Anthropic API error (${response.status}): ${responseText.substring(0, 500)}`);
    }

    let result;
    try {
        result = JSON.parse(responseText);
    } catch (e) {
        throw new Error(`Anthropic API returned non-JSON (${response.status}): ${responseText.substring(0, 300)}`);
    }
    const jsonString = extractJsonFromResponse(result);

    try {
        return JSON.parse(jsonString);
    } catch (e) {
        throw new Error(`Failed to parse extraction result as JSON: ${e.message}\nRaw: ${jsonString.substring(0, 500)}`);
    }
}
