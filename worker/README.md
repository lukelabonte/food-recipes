# Recipe Upload Worker

Cloudflare Worker that processes recipe submissions from the static GitHub Pages site. Handles auth via per-person passphrases, extracts recipe data using Claude Sonnet 4.6, renders HTML from a template, and creates GitHub PRs.

## Setup

### 1. Install dependencies

```bash
cd worker
npm install
```

### 2. Create KV namespace

```bash
npx wrangler kv namespace create KV
```

Copy the output ID and replace `PLACEHOLDER_KV_ID` in `wrangler.toml`.

### 3. Set secrets

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ADMIN_SECRET
```

- **ANTHROPIC_API_KEY** - API key for Claude Sonnet recipe extraction
- **GITHUB_TOKEN** - Fine-grained GitHub PAT with Contents + Pull Requests write access to `lukelabonte/food-recipes`
- **ADMIN_SECRET** - Secret string to protect admin endpoints

### 4. Deploy

```bash
npm run deploy
```

### 5. Create first user

```bash
curl -X POST https://recipe-upload.<your-subdomain>.workers.dev/admin/users \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
  -d '{"displayName": "Luke"}'
```

Save the returned passphrase — this is the user's login credential.

## Local development

```bash
npm run dev
```

This starts a local dev server with `wrangler dev`. You'll need a `.dev.vars` file for secrets:

```
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=github_pat_...
ADMIN_SECRET=your-secret-here
```

## API

### Upload a recipe

```
POST /upload
Content-Type: multipart/form-data

Fields:
  passphrase  (required) - User's passphrase
  text        (required) - Recipe text (paste, typed, etc.)
  url         (optional) - Source URL to fetch additional context
  image       (optional) - Photo of recipe (file upload)
  notes       (optional) - Additional notes for the extractor
  recipeFrom  (optional) - Attribution name (defaults to user's displayName)
```

Attachments must fit within 7.5 MB (7,500,000 bytes). The Worker returns HTTP 413 for larger files.

The upload page offers **Optimize image** for oversized static PNG, JPEG, and WebP files. Optimization happens in the browser and doesn't submit the recipe. Contributors can inspect the preview or restore the original before uploading. Only the optimized copy is uploaded, used for extraction, and archived as `source-1.*`. The original stays on the contributor's device. This doesn't create a photo-generation reference or change its human-review requirement.

Processing is limited to 20 MB of source bytes, 12.5 million source pixels, a 5,400-pixel source edge, a 4,096-pixel canvas edge, and at most nine encoding attempts. Each attempt starts from the decoded source. Lossy exports use quality 0.95; resizing stops at 75% of the original dimensions. These bounds reduce memory risk but don't guarantee available device memory or readable recipe text. Oversized PDFs, HEIC, animated files, unsupported browsers, and images that can't safely fit keep the manual-resize fallback. Files already within the upload limit stay unchanged.

Run automated regressions from the repo root with `node --test worker/test/*.test.js`. For actual browser codecs and form integration, start `python3 scripts/serve.py 8765`, open `http://localhost:8765/worker/test/browser/image-optimizer.html`, and click **Run optimizer and upload checks**. The fixtures use a mocked upload response; nothing is sent to production. Inspect the small quantities in the original and optimized text crops. iPhone Safari and desktop Chromium checks are release requirements; Node tests and a desktop viewport resized to phone dimensions aren't substitutes for iPhone Safari validation.

### Extraction and validation

Extraction rules live in the Messages API's system field. Recipe text, fetched pages, contributor notes, and attachments stay in the user message as untrusted source material. Model output is data, not authorization to change the upload workflow. Each upload makes one extraction call. Validation failures use the existing HTTP 500 and KV error status path, before rendering or any GitHub request. There are no automatic retries or repair calls.

`src/recipe-data.js` validates the existing schema and normalizes supported leading quantity ranges. For example, `1 to 2 packages bratwurst` becomes `1-2 packages bratwurst`. Integers, decimals, ASCII fractions, and supported Unicode fractions work at both endpoints. Units, package sizes, and preparation notes stay intact. Already-supported hyphens and en dashes stay unchanged. Em dashes become hyphens. Normalization is idempotent and doesn't rewrite prose, dimensions, or ranges inside package sizes. Repeated-unit ranges such as `1 cup to 2 cups` aren't normalized; extraction must use `1-2 cups`.

Blocking errors include missing required text, empty ingredient/step lists, invalid nested values, unsupported fields or categories, unusable filenames, and nonpositive or noninteger servings. Source links must use HTTP(S) without embedded credentials. Simple measurements with negative values or clearly wrong gram/nutrient units are rejected. Optional nutrition and weight sections can be null or absent. A missing photo prompt keeps the existing title-derived fallback. If the source doesn't support a numeric serving basis, validation fails rather than inventing one. For a source range such as 8–10 servings, extraction can preserve that yield in Tips and explicitly document a source-supported integer scaling basis.

Missing or unrecognized leading amounts create a nonblocking **Review source data** Tip. Unnormalized leading `to` and em-dash ranges also get that Tip, including ambiguous dimensions such as `1 to 2-inch piece ginger`. The browser leaves these lines unchanged when scaling and keeps them as unmerged source lines in the shopping list, rather than changing or summing only the first endpoint. Confirm their quantities manually. A count next to a package-size parenthesis, such as `1(12-ounce) can beer`, is recognized without a missing-amount warning. Quantity-free ingredients stay quantity-free. A simple cooked batch weight that differs from per-serving grams × servings by more than both 20 g and 15% also creates a Tip. Values aren't corrected. These warnings are idempotent and use the existing Tips card and recipe PR review, not a new review interface. Ranges and measurements with other notation aren't compared. Input gram totals aren't forced to match edible cooked weight: discarded liquid, optional toppings, package sizes, and moisture changes can explain differences.

Extraction must cross-check preparation and serving instructions for missing food, preserve optional status, and avoid duplicate ingredients or equipment. A clear relationship such as one bun per explicitly specified sandwich can support an amount. Otherwise the amount stays unknown. Gram conversions and nutrition estimates need a defensible basis and honest labels. `nutrition.source`, `weight.method`, and Tips describe serving assumptions and whether buns, toppings, and drained liquids are included. No USDA lookup or other verification is available in this request. Source contradictions stay visible rather than being silently reconciled.

Ingredient completeness, source quantity relationships, duplicate food names, conversion accuracy, nutrition provenance, and inclusion assumptions remain model-dependent and need human review. Schema validation doesn't establish that arbitrary recipe prose is correct or prevent every prompt-injection attempt. Per-serving nutrition remains unchanged when the browser changes only batch size.

Focused local checks (Node and Python 3, no added dependencies):

```bash
node --test worker/test/recipe-data.test.js worker/test/extract.test.js worker/test/upload.test.js
```

Tests mock fetch/KV, exercise the existing scaler and shopping parser in isolated VM closures, and feed rendered HTML to the real Python search-index parser without writing generated files. No paid model calls, live uploads, deployments, or GitHub writes occur. Prompt assertions verify the rules supplied to the model, not model compliance. The serving-ingredient fixture is an expected extraction result, not evidence that a live model always finds omitted foods.

### Check upload status

```
GET /upload/status/:id?passphrase=...
```

### Request access

```
POST /request-access
Content-Type: application/json

{ "name": "...", "contact": "...", "message": "..." }
```

### Admin endpoints

All require `X-Admin-Secret` header.

| Method | Path | Description |
|--------|------|-------------|
| POST | /admin/users | Create user (body: `{ displayName }`) |
| GET | /admin/users | List all users |
| DELETE | /admin/users/:passphrase | Delete a user |
| GET | /admin/requests | List access requests |
| DELETE | /admin/requests/:id | Delete an access request |
