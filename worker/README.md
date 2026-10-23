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
