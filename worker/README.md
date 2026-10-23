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

The browser scales every ingredient list and immediate measured-unit equivalents such as `1 cup (4 oz)`. Per-container package sizes stay fixed. Returning to the base serving count restores the original ingredient text, gram annotations, and weight labels. Weight ranges and scope qualifiers survive scaling. Shopping-list identity retains parentheticals and per-package sizes; this can leave some equivalent foods separate rather than incorrectly merging different packages. Mixed scalar/range quantities merge as complete intervals.

Previously checked packaged ingredients can appear unchecked once because their identity now includes the package size. Old checked-state keys aren't deleted or guessed into the new identities; recipes and unrelated checkmarks are preserved.

Steps, tips, substitutions, and alternatives use ingredient-relative wording where their source relationships are clear. The browser doesn't scale arbitrary prose: temperatures, times, dimensions, per-item formulas, and preparation instructions remain unchanged. A note appears on scaled views and prints with them to identify any remaining original-batch amounts. New extractions are instructed to keep batch amounts relative to the ingredient list; that instruction still needs human review.

### Source evidence and PR review

The extraction schema adds an optional top-level `evidence` array. New extractions are instructed to cover `/servings`, `/ingredients/N/text`, `/ingredients/N/grams`, `/nutrition`, and `/weight`. Ingredient indexes are zero-based. Existing recipes and saved responses without evidence still work; their PR review explicitly reports missing provenance. Recipe HTML and browser/index contracts don't change.

```json
{
  "field": "/ingredients/2/text",
  "status": "inferred",
  "sources": [{ "source": "text", "quote": "Makes 8 sandwiches, one bun each." }],
  "note": "Eight buns follow from the explicit sandwich count and one-bun relationship."
}
```

`status` is `stated`, `inferred`, `estimated`, or `unknown`. It classifies the amount or calculation, not whether the named food exists. A source saying “serve with mustard” supports the ingredient but leaves its amount unknown. Unknown entries can have no excerpt. Other entries need a nonempty literal quote. Sources are `text`, `urlContent`, `notes`, or `attachment`. Only unique existing target fields are allowed. Malformed evidence, invented status names, and model-supplied verification flags fail validation before rendering or GitHub requests.

The Worker checks each text excerpt against its submitted source channel. `literal-match` means only that the exact characters occur there. `not-found` and `unavailable` become nonblocking review flags. Attachment excerpts are `model-reported`, never independently verified. Quote presence doesn't establish that an inference, conversion, nutrition value, or source interpretation is correct. A missing field, inferred quantity, estimate, unknown value, or unverified attachment remains visible for human review.

Each recipe PR starts with **Review before merging**, followed by model-reported Tips and nutrition/weight assumptions. A collapsible evidence table shows the field value, classification, excerpts, deterministic checks, and explanation. Source text and contributor metadata are escaped for Markdown/HTML and mentions. No new review page, automatic approval, or extra model call is added. Evidence excerpts become part of the PR, so only relevant recipe facts should be quoted. Avoid personal information, credentials, and unrelated contributor notes; this isn't an automated privacy guarantee.

The output limit is 8,192 tokens to leave room for evidence on ingredient-rich recipes. This raises the maximum output-token cost compared with the prior 4,096 limit, not the number of model calls. Actual charges depend on usage and provider pricing. Very large recipes can still truncate; `max_tokens` remains an explicit error, with no automatic retry or repair.

### Real-browser recipe pipeline checks

Serve the repository with `python3 scripts/serve.py 8765`, open `http://localhost:8765/worker/test/browser/recipe-pipeline.html` in a browser, and click **Run checks**. This fixture loads the real upload form, executes the Worker in-browser with mocked fetch/KV, captures the HTML and mock PR, runs the real scaler, and opens the real shopping-list page. It also checks malformed evidence rejection without GitHub requests. It refuses remote hosting, intercepts before submission, blocks native outbound traffic, and restores the two shopping-list storage entries after each run. A fresh browser profile is still preferred.

Completion is exposed as `document.documentElement.dataset.testStatus` (`pass`, `fail`, or `cancelled`), counts in `#results`, and synthetic artifacts in `window.recipePipelineArtifacts`. Navigation invalidates the active run before stopping frames and restoring storage. Resumed work can't write a new shopping selection. The fixture keeps new runs locked and fetch intercepted until in-process Worker calls settle; a cleanup timeout requires reloading the fixture. Frames and waits are bounded. A failed import or script renders FAIL. Shopping data uses explicit expected index lines; the fixture doesn't run Python. Compare its captured HTML with `RecipeParser` separately. Existing Node consumer tests already run that parser without writing generated files. Desktop Chrome or a narrow viewport doesn't establish iPhone Safari or handwriting recognition behavior.

Run `node --test worker/test/browser-fixture-lifecycle.test.js` for deterministic suspend/resume regressions. These execute the actual fixture script with simulated imports, DOM/page scripts, Worker, transport, and BFCache events. They aren't proof that a particular browser restored the page from its native BFCache.

For existing recipe pages, open `http://localhost:8765/worker/test/browser/recipe-scaling.html` on the same local server and click **Run checks**. This fixture checks real multi-list recipes, second-list substitution controls, gram spans, weight ranges, and exact restoration without shopping-list writes. It blocks nonlocal resources. `?autorun` starts the checks automatically; completion uses the same `data-test-status` and `#results` count fields. Node regressions live in `recipe-scaling-audit.test.js`, `recipe-audit-corrections.test.js`, and `recipe-scale-wording.test.js`.

The separate evaluation harness in [`eval/README.md`](eval/README.md) supplies six synthetic cases, no-cost dry-run/replay, and an explicitly approved live mode capped at six extraction calls. It uses the production request builder and response validator. Mocked responses test the harness, not model compliance. Live runs require an exported credential, record per-check outcomes and actual token usage, and never upload or publish recipes.

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
