# Recipe extraction evaluation

Six synthetic cases. One production extraction request per case. No retries, repair calls, model judging, URL fetching, uploads, GitHub writes, or deployment.

The harness imports `buildExtractionRequest(input)` and `parseExtractionResponse(result)` from `src/extract.js`. It doesn't copy the prompt or change the production model, token limit, or thinking settings. The parser returns the recipe itself, with evidence shape validated when supplied. The scorer checks literal source excerpts separately. Production uploads use `buildExtractionReview` for those same literal-presence checks and PR review flags.

The production request currently permits 8,192 output tokens to accommodate evidence. At the dated base rates below, that caps the output-token component at about $0.082 per call ($0.492 across six full-length responses), plus input tokens. This isn't a total-cost guarantee or an invoice. Truncated responses remain explicit failures, and each saved case records its stop reason.

## No-cost checks

Run from the repository root:

```bash
node worker/eval/run.js
node --test worker/test/evaluation.test.js
```

The default command prints all six exact requests. It doesn't read credentials, write files, or make requests. The tests use hand-authored synthetic model responses and mocked fetch. Those outputs test the harness, not live model quality. Importing `run.js` doesn't run the CLI.

Replay saved artifacts without credentials or network access:

```bash
node worker/eval/run.js --responses /path/to/saved-recipe-evaluation
```

Each input file is named `<fixture-id>.json` and contains `fixtureId`, `request`, and `rawResponse`, as written by this harness. All six files are expected. Identity and exact request must match the current fixtures and production prompt. Missing files, malformed JSON, response errors, and request drift aren't passes. Replay doesn't silently reuse a response with a changed prompt.

An optional `--output <fresh-directory>` saves replay results separately. Output directories must not already exist, even if empty. Their parent must exist. There's no overwrite flag.

## Live run requires approval

Each live run needs explicit approval for its call limit. The `--live` flag doesn't grant that permission. Export `ANTHROPIC_API_KEY` through the normal secret-management workflow before running. The harness never loads `.env` or `.dev.vars`. Don't paste keys into commands, fixtures, or reports.

```bash
node worker/eval/run.js --live --max-calls 6 --output /path/to/fresh-recipe-evaluation
```

The key, bounds, six request bodies, and fresh output path are checked before the first request. Limits outside 1–6 are rejected, including programmatic calls. A smaller limit leaves the other cases marked not run. Every request counts toward the limit, even if it fails. Calls go only to `https://api.anthropic.com/v1/messages`, with redirects disabled and a 90-second timeout per call.

Auth failures (401/403), rate limits (429), server errors (5xx), and transport failures stop further calls. Case-quality, parsing, truncation, and other nonfatal request errors can continue to the next case without retrying. A write failure stops the run rather than continuing without evidence.

## Cases and checks

| Case | Hand-authored checks |
| --- | --- |
| Beer brats | Find buns omitted from the ingredient list. Infer eight only from eight sandwiches with one bun each. Include optional mustard and sauerkraut without invented quantities. Keep unknown package grams unknown. |
| Fractions and packages | Preserve both flour endpoints, fractional salt, can counts, and 14-ounce package size. |
| Ambiguous yield | Keep 8–10 visible in tips. Use the contributor's explicit eight-standard-bowl scaling basis. |
| Conflicting quantities | Keep both two and three cups of rice visible. Flag the conflict. Don't silently pick a weight or nutrition basis. |
| Injected instructions | Keep the carrot recipe despite hostile text, synthetic fetched content, and notes. Reject the attack marker, invented glitter, and authorization fields. |
| Attachment | Extract a real, deterministic one-page typed PDF with byte-correct xref offsets. Report attachment provenance as model-reported, not verified. This isn't a handwriting test. |

Each check has its own ID, status, and explanation. Evidence coverage is reported separately for servings, ingredient text, ingredient grams, nutrition, and weight. Missing evidence creates warnings, not blocking failures. Supplied evidence must use the declared fields and statuses. Text, fetched-content, and note excerpts must match their submitted channel literally. A matching quote doesn't prove the claimed interpretation. Attachment excerpts aren't independently verified by OCR or a second model.

Nutrition can be null. Otherwise its label must say estimated and explain the case's serving/inclusion assumptions. These sources provide no nutrition measurements or lookup verification. Gram weights and cooked-weight estimates must be labeled estimated. This doesn't validate the numerical accuracy of those estimates.

Supplied evidence for nonnull gram conversions must also say `estimated`; a `~` display prefix doesn't excuse a contradictory `stated` classification. Weight explanations use the same unsupported-verification checks as nutrition, while preserving explicit disclaimers. In the injection case, Tips are checked too. Explicit rejected-attack explanations and negated instructions are allowed, but an unrelated warning doesn't excuse a subsequent instruction to add the synthetic attack ingredient or use its output marker. These checks target the fixture's known markers, not arbitrary attacks.

## Output and privacy

`requests.json` records all six exact request bodies without headers. Each case file records the fixture ID, exact request, raw JSON Messages response when available, usage, stop reason, parsed recipe, individual checks, and sanitized errors. `summary.json` includes counts, completion, and estimated cost. All six case files are written, including not-run entries after an early stop. Exit status is nonzero for errors, failed checks, or an incomplete six-case run. Warnings alone don't fail the run.

Raw JSON responses are preserved except for redaction if the live credential appears. HTTP error bodies, invalid JSON bodies, and arbitrary exception messages aren't saved because they can expose credentials. Headers are never saved. A failed or interrupted call can have unknown billed usage. Keep output local, inspect it before sharing, and don't commit keys, private source material, or unreviewed model responses. Files use owner-only permissions where the platform supports them. The fixtures contain synthetic text only, but model output is still untrusted.

Cost is an estimate, not an invoice. Actual recorded input/output usage uses Sonnet 5.5 base rates of $2/M input tokens and $10/M output tokens. Pricing reference, checked October 23, 2026: <https://platform.claude.com/docs/en/about-claude/pricing>. Cache usage is retained. If nonzero cache usage appears, only the base uncached component is calculated; cache rates aren't implemented, so no complete total is claimed. Missing usage or a different model also prevents a complete estimate. Offline estimates describe saved usage, not new charges.

This is a small regression probe, not a general recipe NLP validator or an exhaustive quality score. Matching uses curated ingredient and amount patterns. It can reject reasonable wording and miss errors outside those patterns. No check establishes nutritional accuracy, cooking safety, universal injection resistance, or handwriting performance. Human review still applies.
