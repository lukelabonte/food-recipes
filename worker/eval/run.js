import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as extraction from '../src/extract.js';
import { cases } from './cases.js';
import { estimateCost, scoreRecipe } from './score.js';

export const endpoint = 'https://api.anthropic.com/v1/messages';
export const hardMaxCalls = 6;
const timeoutMilliseconds = 90_000;
class EvaluationError extends Error {}

export function parseArguments(argumentsList) {
    const options = { live: false, maxCalls: 0, output: null, responses: null, help: false };
    const seen = new Set();
    for (let index = 0; index < argumentsList.length; index++) {
        const argument = argumentsList[index];
        if (seen.has(argument)) throw new EvaluationError('Duplicate option.');
        seen.add(argument);
        if (argument === '--live') options.live = true;
        else if (argument === '--help') options.help = true;
        else if (['--max-calls', '--output', '--responses'].includes(argument)) {
            const value = argumentsList[++index];
            if (!value || value.startsWith('--')) throw new EvaluationError('Missing option value.');
            if (argument === '--max-calls') {
                if (!/^[1-6]$/.test(value)) throw new EvaluationError('Call limit must be an integer from 1 through 6.');
                options.maxCalls = Number(value);
            } else options[argument === '--output' ? 'output' : 'responses'] = value;
        } else throw new EvaluationError('Unknown option.');
    }
    validateOptions(options);
    return options;
}

export function validateOptions(options) {
    if (!options || typeof options !== 'object') throw new EvaluationError('Options are required.');
    if (typeof options.live !== 'boolean') throw new EvaluationError('Live mode must be explicit.');
    if (options.live && options.responses) throw new EvaluationError('Live and offline replay are mutually exclusive.');
    if (options.live && (!Number.isSafeInteger(options.maxCalls) || options.maxCalls < 1 || options.maxCalls > hardMaxCalls)) {
        throw new EvaluationError('Live mode requires an explicit call limit from 1 through 6.');
    }
    if (!options.live && options.maxCalls !== 0) throw new EvaluationError('Call limits apply only to live mode.');
    if (options.live && !options.output) throw new EvaluationError('Live mode requires a fresh output directory.');
    if (!options.live && !options.responses && options.output) throw new EvaluationError('Dry-run prints requests without writing output.');
    for (const key of ['responses', 'output']) {
        if (options[key] != null && (typeof options[key] !== 'string' || !options[key].trim())) throw new EvaluationError('Directories must be nonempty paths.');
    }
}

function requireHelpers(helpers) {
    if (typeof helpers.buildExtractionRequest !== 'function' || typeof helpers.parseExtractionResponse !== 'function') {
        throw new EvaluationError('Production buildExtractionRequest and parseExtractionResponse exports are required.');
    }
}

function summarize(records, mode, calls) {
    const checks = records.flatMap(record => record.evaluation?.checks || []);
    const evaluated = records.filter(record => record.evaluation);
    const usageRecords = records.filter(record => record.rawResponse !== null);
    const knownCosts = usageRecords.map(record => record.cost?.estimatedUSD);
    const attempted = records.filter(record => record.status !== 'not-run');
    return {
        mode, fixtureCount: cases.length, calls,
        evaluated: evaluated.length, passed: evaluated.filter(record => record.evaluation.passed).length,
        failed: evaluated.filter(record => !record.evaluation.passed).length,
        errors: records.filter(record => record.error).length,
        notRun: records.filter(record => record.status === 'not-run').length,
        checks: Object.fromEntries(['pass', 'fail', 'warn'].map(status => [status, checks.filter(check => check.status === status).length])),
        estimatedUSD: usageRecords.length && usageRecords.length === attempted.length && knownCosts.every(cost => typeof cost === 'number') ? knownCosts.reduce((sum, cost) => sum + cost, 0) : null,
        costNote: mode === 'offline' ? 'Replay estimates describe saved usage, not new charges. Missing/cached usage prevents a complete total. Estimates are not invoices.' :
            'Estimate, not an invoice. Missing/cached usage or a failed request can leave billed usage unknown. See per-case usage and estimates.',
        complete: evaluated.length === cases.length && records.every(record => !record.error && record.evaluation?.passed),
        limitation: 'Six curated synthetic cases. Passing is not an exhaustive quality, security, nutrition, or handwriting assessment.'
    };
}

export async function runEvaluation(options, dependencies = {}) {
    // Revalidate here so programmatic callers cannot bypass CLI bounds.
    validateOptions(options);
    const helpers = dependencies.helpers || extraction;
    requireHelpers(helpers);
    if (cases.length !== hardMaxCalls || new Set(cases.map(fixture => fixture.id)).size !== hardMaxCalls) throw new EvaluationError('Exactly six unique fixtures are required.');
    let apiKey;
    if (options.live) {
        apiKey = (dependencies.environment || process.env).ANTHROPIC_API_KEY;
        if (typeof apiKey !== 'string' || !apiKey.trim()) throw new EvaluationError('Live evaluation requires exported ANTHROPIC_API_KEY. No request was sent.');
    }
    // Build every exact production request before creating output or using the network.
    const requests = cases.map(fixture => ({ fixtureId: fixture.id, request: helpers.buildExtractionRequest(fixture.input) }));
    for (const { request } of requests) {
        if (!request || typeof request.model !== 'string' || !Number.isSafeInteger(request.max_tokens) || request.max_tokens <= 0 || !Array.isArray(request.messages)) {
            throw new EvaluationError('Invalid production extraction request.');
        }
    }
    const mode = options.live ? 'live' : options.responses ? 'offline' : 'dry-run';
    if (mode === 'dry-run') return { mode, calls: 0, requests, note: 'No credentials read, files written, or network requests made.' };

    const output = options.output ? resolve(options.output) : null;
    const responses = options.responses ? resolve(options.responses) : null;
    if (output) {
        // No recursive mkdir or overwrite flag: the parent must exist and this directory must not.
        await mkdir(output, { mode: 0o700 });
        await writeFile(resolve(output, 'requests.json'), JSON.stringify({ mode, requests }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    }
    const save = async (filename, value) => {
        if (output) await writeFile(resolve(output, filename), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    };
    const records = [];
    let calls = 0;
    let stopped = false;
    for (const [index, fixture] of cases.entries()) {
        const request = requests[index].request;
        const record = {
            fixtureId: fixture.id, mode, request, rawResponse: null, usage: null, stopReason: null,
            parsedRecipe: null, evaluation: null, error: null, status: 'not-run', cost: null
        };
        let fatal = false;
        if (stopped || (options.live && calls >= options.maxCalls)) {
            record.notRunReason = stopped ? 'Stopped after a service/transport failure.' : 'Explicit call budget exhausted.';
        } else if (mode === 'offline') {
            try {
                const saved = JSON.parse(await readFile(resolve(responses, `${fixture.id}.json`), 'utf8'));
                if (saved.fixtureId !== fixture.id || JSON.stringify(saved.request) !== JSON.stringify(request)) {
                    record.error = { kind: 'replay-mismatch', message: 'Saved fixture identity or exact request differs from this run.' };
                } else if (saved.rawResponse == null) {
                    record.error = { kind: 'missing-response', message: 'Saved artifact contains no Messages response.' };
                } else {
                    record.rawResponse = saved.rawResponse;
                }
            } catch {
                record.error = { kind: 'offline-input', message: 'Saved case artifact is missing, unreadable, or invalid JSON.' };
            }
            record.status = 'error';
        } else {
            // One call per fixture, including failed requests. No retry/repair/model judging path.
            if (calls >= hardMaxCalls) throw new EvaluationError('Hard call limit reached.');
            calls++;
            try {
                const response = await (dependencies.fetch || globalThis.fetch)(endpoint, {
                    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMilliseconds),
                    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
                    body: JSON.stringify(request)
                });
                record.httpStatus = response.status;
                if (!response.ok) {
                    // Do not persist error bodies, request headers, or thrown messages that might contain credentials.
                    record.error = { kind: 'http', status: response.status, message: 'Messages API rejected the request. Response body omitted for credential safety.' };
                    fatal = [401, 403, 429].includes(response.status) || response.status >= 500;
                    await response.body?.cancel();
                } else {
                    const text = (await response.text()).replaceAll(apiKey, '[redacted-credential]');
                    try { record.rawResponse = JSON.parse(text); }
                    catch { record.error = { kind: 'invalid-response-json', message: 'Messages API returned invalid JSON. Body omitted.' }; }
                }
            } catch {
                record.error = { kind: 'transport', message: 'Messages request failed or timed out. No retry; remaining calls stopped.' };
                fatal = true;
            }
            record.status = 'error';
        }
        if (record.status !== 'not-run' && !record.error && record.rawResponse === null) {
            record.error = { kind: 'invalid-response', message: 'Messages API returned no usable response object.' };
        }
        if (record.rawResponse !== null) {
            record.usage = record.rawResponse.usage ?? null;
            record.stopReason = record.rawResponse.stop_reason ?? null;
            record.cost = estimateCost(record.usage, request.model);
            try {
                record.parsedRecipe = helpers.parseExtractionResponse(record.rawResponse);
                record.evaluation = scoreRecipe(fixture, record.parsedRecipe);
                record.status = record.evaluation.passed ? 'pass' : 'fail';
            } catch {
                record.error = { kind: 'parse-or-validation', message: 'Production parser/validation or scoring rejected the response. Inspect the saved raw response.' };
                record.status = 'error';
            }
        }
        records.push(record);
        await save(`${fixture.id}.json`, record);
        if (fatal) stopped = true;
    }
    const summary = summarize(records, mode, calls);
    await save('summary.json', summary);
    return { mode, requests, records, summary };
}

const help = `Recipe extraction evaluation (six synthetic cases).
  node worker/eval/run.js
  node worker/eval/run.js --responses <saved-directory> [--output <fresh-directory>]
  node worker/eval/run.js --live --max-calls 6 --output <fresh-directory>
Default is a no-cost dry-run. Live mode needs approval and exported ANTHROPIC_API_KEY.
No dotenv files, external URL fetching, retries, uploads, or publishing.\n`;

export async function main(argumentsList = process.argv.slice(2)) {
    try {
        const options = parseArguments(argumentsList);
        if (options.help) { console.log(help); return 0; }
        const result = await runEvaluation(options);
        console.log(JSON.stringify(result, null, 2));
        return result.summary && !result.summary.complete ? 1 : 0;
    } catch (error) {
        // Never print user paths, environment values, request headers, or arbitrary exception messages.
        const message = error instanceof EvaluationError ? error.message : error?.code === 'EEXIST' ?
            'Output directory already exists. Choose a fresh directory; nothing will be overwritten.' :
            'Evaluation did not complete. Check the output parent, filesystem access, and production helpers. No retries performed.';
        console.error(message);
        return 1;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    process.exitCode = await main();
}
