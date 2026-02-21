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
