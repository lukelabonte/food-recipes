import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Script } from 'node:vm';

const html = readFileSync(new URL('./browser/recipe-pipeline.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];

test('recipe pipeline fixture has a parseable bootstrap and machine-readable completion', () => {
    assert.ok(script, 'The classic bootstrap must exist so failed imports render FAIL');
    assert.doesNotThrow(() => new Script(script));
    assert.match(html, /id="run"[^>]*>Run checks/);
    assert.match(html, /id="results"[^>]*data-pass-count="0"[^>]*data-fail-count="0"/);
    assert.match(script, /dataset\.testStatus = run\.controller\.signal\.aborted \? 'cancelled' : failCount \? 'fail' : 'pass'/);
    assert.match(script, /catch \(error\) \{\s*report\(false,/);
});

test('recipe pipeline fixture blocks native remote traffic and bounds iframe loading', () => {
    assert.match(html, /connect-src 'self'/);
    assert.match(script, /connect-src 'none'/);
    assert.match(script, /form-action 'none'/);
    assert.match(script, /\['localhost', '127\.0\.0\.1', '\[::1\]'\]\.includes\(location\.hostname\)/);
    assert.match(script, /redirect: 'error', signal: AbortSignal\.any\(\[run\.controller\.signal, AbortSignal\.timeout\(timeoutMilliseconds\)\]\)/);
    assert.equal((script.match(/nativeFetch\(/g) || []).length, 1, 'Native fetch has one allowlisted local-page call site');
    assert.match(script, /assert\(\['\/upload\.html', '\/shopping-list\.html'\]\.includes\(path\)/);
    assert.match(script, /const loaded = bounded\(new Promise/);
    assert.match(script, /page\.fetch = handler/);
    assert.ok(script.indexOf('parent.installRecipePipelineFrame(') < script.indexOf('frame.srcdoc ='));
    assert.ok(script.indexOf('await loadFrame(uploadHTML') < script.indexOf(".requestSubmit()"));
    assert.match(script, /assert\(url\.startsWith\(prefix\), 'Blocked unexpected outbound Worker request'\)/);
    assert.match(script, /window\.fetch = originalFetch/);
});

test('recipe pipeline fixture snapshots and restores only shopping storage', () => {
    assert.match(script, /const storageKeys = \['shopping-list-recipes', 'shopping-list-checked'\]/);
    assert.match(script, /savedStorage = storageKeys\.map\(key => \[key, localStorage\.getItem\(key\)\]\)/);
    assert.match(script, /if \(value === null\) localStorage\.removeItem\(key\)/);
    assert.match(script, /else localStorage\.setItem\(key, value\)/);
    assert.match(script, /window\.addEventListener\('pagehide', \(\) => \{[\s\S]*activeRun\.controller\.abort\(\);[\s\S]*stopFrames\(\);[\s\S]*restoreStorage\(\);/);
    assert.match(script, /Original shopping storage restored byte-for-byte/);
    assert.doesNotMatch(script, /localStorage\.clear\(/);
});

test('recipe pipeline fixture states its parser limitation and uses real browser consumers', () => {
    assert.match(html, /not Python's RecipeParser/);
    assert.match(script, /import\('\.\.\/\.\.\/src\/index\.js'\)/);
    assert.match(script, /import\('\.\.\/fixtures\/recipe\.js'\)/);
    assert.match(script, /worker\.fetch\(request, environment\)/);
    assert.match(script, /await localPage\('\/shopping-list\.html'\)/);
    assert.match(script, /return Response\.json\(indexData\)/);
    assert.match(script, /actual recipe\.js/);
    assert.match(script, /photoPrompt: null/);
    assert.match(script, /blobs\.length === 1/);
});
