import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, Script } from 'node:vm';
import { validRecipe, beerBrats } from './fixtures/recipe.js';

const html = readFileSync(new URL('./browser/recipe-pipeline.html', import.meta.url), 'utf8');
const source = html.match(/<script>([\s\S]*)<\/script>/)[1];
const originalStorage = [
    ['shopping-list-recipes', ' ["family-dinner"] '],
    ['shopping-list-checked', '{ "broth": true }']
];

function deferred() {
    let resolve;
    const promise = new Promise(complete => { resolve = complete; });
    return { promise, resolve };
}

function fixture(pauseAt) {
    const reached = deferred();
    const resume = deferred();
    const storage = new Map(originalStorage);
    const events = new Map();
    const observers = new Set();
    const mutations = [];
    const pendingSubmissions = [];
    const timers = new Map();
    const cleanupWait = deferred();
    let nextFrame;
    const elements = {
        run: { addEventListener(name, handler) { this[name] = handler; }, disabled: false },
        results: { dataset: {}, textContent: '' },
        frames: {
            children: [],
            append(frame) {
                mutations.push('frame:append');
                this.children.push(frame);
                nextFrame?.resolve(frame);
                nextFrame = null;
                const identifier = frame.srcdoc.match(/installRecipePipelineFrame\(window, '([^']+)'/)[1];
                window.installRecipePipelineFrame(frame.contentWindow, identifier);
                const finish = () => frame.listeners.get('load')?.();
                if (pauseAt === 'frame' && this.children.length === 1) {
                    reached.resolve();
                    resume.promise.then(finish);
                } else queueMicrotask(finish);
            },
            replaceChildren() {
                for (const frame of this.children) frame.removed = true;
                this.children = [];
            }
        }
    };
    const root = { dataset: {} };
    const window = {
        addEventListener(name, handler) { events.set(name, handler); },
        async fetch(url) {
            mutations.push(`fetch:${new URL(url).pathname}`);
            if (pauseAt === 'page' && new URL(url).pathname === '/shopping-list.html') {
                reached.resolve();
                await resume.promise;
            }
            return { ok: true, text: async () => '<head></head>' };
        }
    };
    const originalFetch = window.fetch;
    let submissionCount = 0;
    let submissionArtifacts = null;
    let shoppingReady = false;
    let hostile;

    const uploadControls = Object.fromEntries(['passphrase', 'recipe', 'notes', 'upload-status', 'upload-form']
        .map(identifier => [identifier, { value: '' }]));
    let uploadStatus = 'status-success';
    uploadControls['upload-status'].classList = { contains: name => name === uploadStatus };
    uploadControls['upload-form'].requestSubmit = () => {
        if (submissionArtifacts !== window.recipePipelineArtifacts) {
            submissionArtifacts = window.recipePipelineArtifacts;
            submissionCount = 0;
        }
        uploadStatus = 'status-processing';
        const task = (async () => {
            submissionCount++;
            hostile = uploadControls.notes.value;
            const bridge = elements.frames.children[0].contentWindow.fetch;
            await bridge(uploadControls['upload-form'].action, { method: 'POST', body: 'fixture' });
            uploadStatus = submissionCount === 3 ? 'status-error' : 'status-success';
            if (pauseAt === 'shopping' && submissionCount === 3) {
                uploadStatus = 'status-processing';
                reached.resolve();
                await resume.promise;
                uploadStatus = 'status-error';
            }
            for (const observer of observers) observer.callback();
        })();
        // A removed iframe may reject its outstanding synthetic submission on cancellation.
        pendingSubmissions.push(task.catch(() => {}));
    };
    const uploadPage = {
        body: {},
        getElementById: identifier => uploadControls[identifier],
        querySelector: () => ({ disabled: uploadStatus === 'status-processing' })
    };

    function recipePage() {
        const artifact = window.recipePipelineArtifacts.recipes.at(-1);
        const expected = artifact.expectedIndex.ingredients;
        const doubled = artifact.title === 'Beer Brats'
            ? ['2-4 packages bratwurst', '8-12 cans beer', '16 buns', ...expected.slice(3)]
            : ['4 cups broth', '4 (10-12 ounce) packages noodles', ...expected.slice(2)];
        let servings = 8;
        const nutrition = 'unchanged nutrition';
        return {
            body: {},
            querySelectorAll(selector) {
                if (selector === '.ingredient-list > li') return (servings === 8 ? expected : doubled)
                    .map(textContent => ({ childNodes: [{ nodeType: 3, textContent }] }));
                if (selector === '.weight-list > li') return (servings === 8
                    ? ['~488 g', '~480 g', '~60 g'] : ['~976 g', '~960 g', '~60 g'])
                    .map(textContent => ({ lastChild: { textContent } }));
                throw new Error(`Unexpected recipe selector: ${selector}`);
            },
            querySelector(selector) {
                if (selector.startsWith('[aria-label=')) return { click() { servings += selector.includes('Increase') ? 1 : -1; } };
                if (selector === '.stepper-value') return { textContent: String(servings) };
                if (selector === '#tips') return { textContent: 'not mechanically scalable' };
                if (selector === '#steps ol li:last-child') return { textContent: hostile };
                if (selector === '.source-link') return { textContent: `Adapted from ${hostile}` };
                if (selector === '#steps script') return null;
                if (selector === '.nutrition-list') return { textContent: nutrition };
                if (selector === '.nutrition-source') return { textContent: servings === 8 ? nutrition : 'Batch scaled to 16 servings' };
                if (selector === '.ingredient-grams') return { textContent: servings === 8 ? '(~488 g)' : '(~976 g)' };
                throw new Error(`Unexpected recipe selector: ${selector}`);
            }
        };
    }

    const shoppingPage = {
        body: {},
        getElementById: () => ({ textContent: '2 recipes' }),
        querySelectorAll(selector) {
            const lines = window.recipePipelineArtifacts.recipes.flatMap(recipe => recipe.expectedIndex.ingredients)
                .map(line => line.replace('1-2 packages', '1–2 pkg').replace('4-6 cans', '4–6 cans'));
            if (selector === '.shopping-item') return shoppingReady ? [{}] : [];
            if (selector === '.shopping-item-text') return lines.map(textContent => ({ textContent }));
            if (selector === '.shopping-item-sources') return lines;
            throw new Error(`Unexpected shopping selector: ${selector}`);
        },
        querySelector: () => ({ checked: true, click() { localStorage.setItem('shopping-list-checked', '{"fixture":true}'); } })
    };
    const localStorage = {
        getItem: key => storage.get(key) ?? null,
        setItem(key, value) { mutations.push(`storage:${key}`); storage.set(key, value); },
        removeItem(key) { mutations.push(`storage:${key}`); storage.delete(key); }
    };
    const document = {
        documentElement: root,
        getElementById: identifier => elements[identifier],
        createElement() {
            const frame = {
                listeners: new Map(),
                contentWindow: {
                    addEventListener(name, handler) { this[name] = handler; },
                    stop() { frame.stopped = true; }
                },
                setAttribute() {},
                addEventListener(name, handler) { this.listeners.set(name, handler); },
                get contentDocument() {
                    if (this.title.startsWith('Real upload')) return uploadPage;
                    if (this.title.startsWith('Real shopping')) return shoppingPage;
                    return this.recipePage ||= recipePage();
                }
            };
            // Simulate the shopping script's intercepted index request before its load event.
            const onLoad = frame.addEventListener;
            frame.addEventListener = function (name, handler) {
                onLoad.call(this, name, name === 'load' ? async () => {
                    if (frame.title.startsWith('Real shopping')) {
                        await frame.contentWindow.fetch('/assets/recipes.json');
                        shoppingReady = true;
                    }
                    handler();
                } : handler);
            };
            return frame;
        }
    };
    const worker = { async fetch(request, environment) {
        if (pauseAt === 'worker' && submissionCount === 1) {
            reached.resolve();
            await resume.promise;
        }
        const extraction = await window.fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST', body: JSON.stringify({ max_tokens: 8192, system: '', messages: [hostile] })
        });
        const recipe = JSON.parse((await extraction.json()).content[0].text);
        if (recipe.evidence) {
            await environment.KV.put(`upload:${submissionCount}`, '{"status":"error"}');
            return Response.json({});
        }
        const prefix = 'https://api.github.com/repos/browser-fixture/recipes/';
        const url = recipe.category + '/' + (recipe.title === 'Beer Brats' ? 'beer-brats' : 'browser-package-soup') + '.html';
        for (const [route, body] of [
            ['git/blobs', { content: '<head></head>&lt;script&gt;' }],
            ['git/trees', { tree: [{ path: url }] }],
            ['pulls', { base: 'main', head: 'upload/fixture', body: '## Review before merging\nSource evidence is missing' }]
        ]) await window.fetch(prefix + route, { method: 'POST', body: JSON.stringify(body) });
        await environment.KV.put(`upload:${submissionCount}`, '{"status":"complete"}');
        return Response.json({});
    } };
    const context = createContext({
        window, document, localStorage, location: new URL('http://localhost/worker/test/browser/recipe-pipeline.html'),
        URL, Request, Response, AbortSignal, AbortController, structuredClone,
        setTimeout(callback, milliseconds) {
            const timer = setTimeout(callback, milliseconds);
            timers.set(timer, callback);
            if (root.dataset.testStatus === 'cancelled') cleanupWait.resolve();
            return timer;
        },
        clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; }
            observe() { observers.add(this); }
            disconnect() { observers.delete(this); }
        },
        async fixtureImport(path) {
            if (pauseAt === 'import') {
                reached.resolve();
                await resume.promise;
            }
            return path.includes('index.js') ? { default: worker } : { validRecipe, beerBrats };
        }
    });
    // The only source rewrite substitutes the module loader. DOM/page scripts, Worker,
    // transport, and BFCache events are simulated; the fixture's lifecycle functions,
    // awaits, event handlers, storage access, assertions, and cleanup execute unchanged.
    new Script(source.replace(/\bimport\(/g, 'fixtureImport(')).runInContext(context);
    return {
        elements, root, storage, mutations, reached, resume, originalFetch, window, cleanupWait,
        click: () => elements.run.click(),
        nextFrame() { nextFrame = deferred(); return nextFrame.promise; },
        expireCleanupWait() {
            assert.equal(timers.size, 1, 'Only the bounded Worker cleanup timer remains');
            for (const [timer, callback] of timers) { clearTimeout(timer); callback(); }
        },
        async settle() { await Promise.all(pendingSubmissions); },
        hideAndRestore() { events.get('pagehide')({ persisted: true }); events.get('pageshow')?.({ persisted: true }); }
    };
}

for (const pauseAt of ['import', 'page', 'frame', 'worker', 'shopping']) {
    test(`pagehide invalidates the active fixture at ${pauseAt} without stale mutations`, { timeout: 3000 }, async () => {
        const browser = fixture(pauseAt);
        let finished = false;
        const run = browser.click().then(() => { finished = true; });
        await browser.reached.promise;
        const staleFrames = [...browser.elements.frames.children];
        const staleFetch = browser.window.fetch;
        browser.hideAndRestore();
        const mutationsAfterHide = browser.mutations.length;
        // A second programmatic click must not start a run while the old run unwinds.
        await browser.click();
        if (pauseAt === 'worker') assert.equal(finished, false, 'The run stays locked until its mocked Worker settles');
        browser.resume.resolve();
        await run;
        await browser.settle();
        assert.deepEqual([...browser.storage], originalStorage, 'Original opaque shopping strings survive resume');
        assert.deepEqual(browser.mutations.slice(mutationsAfterHide), [], 'No resumed storage writes, fetches, or frame creation');
        assert.ok(staleFrames.every(frame => frame.stopped && frame.removed), 'Active iframe work is stopped and detached');
        assert.equal(browser.root.dataset.testStatus, 'cancelled', 'Cancelled runs never report pass');
        assert.equal(browser.window.fetch, browser.originalFetch, 'The original transport is restored after unwinding');
        assert.equal(browser.elements.run.disabled, false);
        if (pauseAt === 'shopping') {
            const nextFrame = browser.nextFrame();
            const newerRun = browser.click();
            await nextFrame;
            const newerFetch = browser.window.fetch;
            assert.notEqual(newerFetch, browser.originalFetch, 'The newer run has installed its own transport');
            await assert.rejects(staleFetch('https://api.github.com/repos/browser-fixture/recipes/git/ref/heads/main'), /cancel/i);
            assert.equal(browser.window.fetch, newerFetch, 'A stale handler cannot replace the newer run transport');
            const stalePage = staleFrames[0].contentWindow;
            stalePage.error({ message: 'Late error from the cancelled iframe' });
            const identifier = staleFrames[0].srcdoc.match(/installRecipePipelineFrame\(window, '([^']+)'/)[1];
            assert.throws(() => browser.window.installRecipePipelineFrame(stalePage, identifier), /Unknown iframe bridge/);
            await newerRun;
            assert.equal(browser.root.dataset.testStatus, 'pass', browser.elements.results.textContent);
            assert.deepEqual([...browser.storage], originalStorage);
        }
    });
}

test('a timed-out Worker cleanup keeps stale work isolated and new runs locked', { timeout: 3000 }, async () => {
    const browser = fixture('worker');
    const run = browser.click();
    await browser.reached.promise;
    browser.hideAndRestore();
    await browser.cleanupWait.promise;
    const interceptedFetch = browser.window.fetch;
    browser.expireCleanupWait();
    await run;
    assert.equal(browser.root.dataset.testStatus, 'cancelled');
    assert.match(browser.elements.results.textContent, /Timed out: mock Worker cleanup; reload the fixture/);
    assert.equal(browser.elements.run.disabled, true);
    assert.deepEqual([...browser.storage], originalStorage);
    const mutationsAfterCleanup = browser.mutations.length;
    await browser.click();
    browser.resume.resolve();
    await browser.settle();
    assert.deepEqual(browser.mutations.slice(mutationsAfterCleanup), []);
    assert.equal(browser.window.fetch, interceptedFetch, 'Delayed Worker calls cannot reach native transport');
    await assert.rejects(interceptedFetch('https://api.github.com/repos/browser-fixture/recipes/git/ref/heads/main'), /cancel/i);
});

test('the uncancelled Run checks path still passes and restores storage', { timeout: 3000 }, async () => {
    const browser = fixture();
    await browser.click();
    await browser.settle();
    assert.equal(browser.root.dataset.testStatus, 'pass', browser.elements.results.textContent);
    assert.equal(browser.elements.results.dataset.failCount, '0');
    assert.deepEqual([...browser.storage], originalStorage);
    assert.equal(browser.window.fetch, browser.originalFetch);
});
