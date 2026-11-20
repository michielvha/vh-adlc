import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { checkMobileBus, monitorMobileBus } from './fixtures/mobile-bus.js';

const enabled = process.env.REMOTE_GUI_MOBILE_E2E === '1';
const requireModule = createRequire(import.meta.url);

const fields = [
    ['<div contenteditable="true">Editable text</div>', 'text'],
    ['<textarea></textarea>', 'text'],
    ['<input type="email" name="synthetic-name" placeholder="synthetic-placeholder">', 'email'],
    ['<input type="tel">', 'tel'],
    ['<input type="url">', 'url'],
    ['<input type="search">', 'search'],
    ['<input type="number">', 'number'],
    ['<input type="password">', 'password'],
    ['<input readonly value="synthetic-readonly">', null],
    ['<input disabled value="synthetic-disabled">', null],
];

test.skipIf(!enabled)('two inline taps edit a URL and a field through stock Chromium and noVNC', async () => {
    const { chromium } = requireModule(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE);
    const root = mkdtempSync(join(tmpdir(), 'rg-mobile-e2e-'));
    const observations = { geometry: null, edit: null, cover: null };
    const fixture = createServer(async (request, response) => {
        const path = new URL(request.url, 'http://127.0.0.1').pathname;
        if (request.method === 'POST' && (path === '/geometry' || path === '/edit' || path === '/cover')) {
            let body = '';
            for await (const part of request) {
                body += part;
                if (body.length > 512) { response.writeHead(400).end(); return; }
            }
            observations[path.slice(1)] = JSON.parse(body);
            response.writeHead(204).end();
            return;
        }
        if (request.method !== 'GET' || path !== '/s') {
            response.writeHead(404).end();
            return;
        }
        response.setHeader('Content-Type', 'text/html');
        response.end(`<!doctype html><meta charset="utf-8"><title>Remote keyboard fixture</title>
<style>body{margin:0}#entry{position:absolute;left:35px;top:120px;width:250px;height:55px;font:18px sans-serif}
#plain{position:absolute;left:40px;top:310px}
#cover{position:absolute;left:235px;top:120px;width:45px;height:55px;background:#ddd}
#fields{position:absolute;left:35px;top:380px;display:grid;grid-template-columns:150px 150px;gap:10px}
#fields>*{width:100%;height:50px;box-sizing:border-box}</style>
<input id="entry" aria-label="Synthetic text"><div id="cover"></div><p id="plain">Plain area</p>
<div id="fields">${fields.map(([html]) => html).join('')}</div>
<script>
const field=document.querySelector('#entry');
let count=0;
function post(path,value){fetch(path,{method:'POST',body:JSON.stringify(value)})}
function geometry(){post('/geometry',{top:outerHeight-innerHeight})}
setTimeout(geometry,600);
addEventListener('resize',geometry);
const cover=document.getElementById('cover');
cover.addEventListener('mousedown',event=>event.preventDefault());
cover.addEventListener('click',()=>post('/cover',{keptFocus:document.activeElement===field}));
field.addEventListener('input',()=>post('/edit',{exact:field.value==='z',count:++count}));
</script>`);
    });
    const cli = (...args) => JSON.parse(execFileSync(process.env.REMOTE_GUI_TEST_BINARY,
        [...args, '--home', root, '--transport', 'loopback'], { encoding: 'utf8', timeout: 40000 }));
    let session;
    let browser;
    let stopMonitor;
    let safe = false;
    try {
        await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
        session = cli('start', '--browser-mode', 'human', '--ttl', '4m');
        assert.equal(session.browser_mode, 'human');
        assert.equal(session.local_cdp ?? '', '');
        stopMonitor = await monitorMobileBus(session.id);
        const access = cli('access', session.id, '--reveal');
        browser = await chromium.launch({
            executablePath: process.env.REMOTE_GUI_CHROMIUM,
            chromiumSandbox: true,
            args: ['--disable-gpu'],
        });
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            hasTouch: true,
            isMobile: true,
            serviceWorkers: 'block',
            httpCredentials: { username: 'viewer', password: access.access_code, origin: new URL(session.url).origin },
        });
        const page = await context.newPage();
        async function captureFailure() {
            const directory = process.env.REMOTE_GUI_ARTIFACT_DIR;
            if (!directory) return;
            mkdirSync(directory, { recursive: true });
            await page.screenshot({ path: join(directory, 'mobile-address-bar.png'), timeout: 3000 }).catch(() => {});
        }
        let lastSample;
        const focusReplies = [];
        page.on('response', async response => {
            if (!response.url().endsWith('/__remote_gui/editable')) return;
            const field = response.ok() ? await response.json().catch(() => null) : null;
            focusReplies.push([response.status(), field?.mode]);
            if (field) lastSample = { field, started: response.request().timing().startTime };
        });
        await page.goto(session.url);
        await page.getByRole('link', { name: 'Open session' }).click();
        await page.getByText('Shared browser connected').waitFor({ timeout: 15000 });
        const canvas = page.locator('#screen canvas');
        const prompt = page.getByRole('button', { name: 'Tap to type' });
        const editor = page.locator('#mobile-editor');
        const editorFocused = () => editor.evaluate(node => document.activeElement === node);
        const tap = async (x, y) => {
            const { left, top, scaleX, scaleY } = await canvas.evaluate(node => {
                const box = node.getBoundingClientRect();
                return { left: box.left, top: box.top, scaleX: box.width / node.width, scaleY: box.height / node.height };
            });
            await page.touchscreen.tap(left + x * scaleX, top + y * scaleY);
        };
        await page.waitForFunction(() => document.querySelector('#screen canvas')?.width === 390);
        // Establish focus on the owned X11 window before sending Chromium shortcuts.
        await canvas.click({ position: { x: 18, y: 140 } });
        await canvas.focus();
        await page.keyboard.press('Control+t');
        await page.keyboard.press('Control+l');
        // Read the focused native entry once to place the tap at its actual
        // position. Chromium's toolbar dimensions vary with runner builds.
        const probes = [];
        let addressField;
        for (let attempt = 0; attempt < 3 && !addressField; attempt++) {
            for (const [x, y] of [[195, 60], [150, 60], [240, 60], [195, 70], [150, 70], [240, 70], [195, 50], [195, 80], [150, 90], [240, 90]]) {
                const { status, field } = await page.evaluate(async point => {
                    const reply = await fetch('/__remote_gui/editable', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Remote-Gui-Editable': '1' },
                        body: JSON.stringify(point),
                    });
                    return { status: reply.status, field: reply.ok ? await reply.json() : null };
                }, { x, y });
                probes.push([x, y, status, field?.mode]);
                if (field?.mode === 'url') {
                    addressField = field;
                    break;
                }
            }
            if (!addressField) await delay(200);
        }
        if (!addressField) await captureFailure();
        assert.ok(addressField, 'Chromium did not report a focused address bar: ' + JSON.stringify(probes));
        await page.route('**/__remote_gui/editable', route => route.fulfill({ status: 503 }), { times: 1 });
        await page.route('**/__remote_gui/editable-phase', route => route.fulfill({ status: 503 }), { times: 1 });
        await tap(Math.floor(addressField.x + addressField.width / 2), Math.floor(addressField.y + addressField.height / 2));
        await prompt.waitFor({ timeout: 5500 }).catch(async error => {
            await captureFailure();
            throw new Error('The address bar prompt did not appear. Focus replies: ' + JSON.stringify(focusReplies.slice(-8)), { cause: error });
        });
        assert.equal(await editorFocused(), false);
        await prompt.tap();
        assert.equal(await editorFocused(), true);
        // Exercise a keyboard transition that briefly reports the old height.
        await page.evaluate(async () => {
            const viewport = window.visualViewport;
            const baseline = viewport.height;
            let height = baseline;
            Object.defineProperty(viewport, 'height', { configurable: true, get: () => height });
            const resize = (next) => {
                height = next;
                viewport.dispatchEvent(new Event('resize'));
            };
            resize(baseline - 230);
            resize(baseline - 8);
            await new Promise(resolve => setTimeout(resolve, 80));
            resize(baseline - 235);
        });
        assert.equal(await editorFocused(), true, 'the keyboard animation dismissed the editor');
        // A slow check must not dismiss the local keyboard. No character
        // typed while the remote focus is unverified may be sent or replayed.
        const paused = page.getByText('Typing paused. Checking connection…');
        const resumed = page.getByText('Typing resumed. Re-enter missed keys.');
        const focusUnavailable = route => route.fulfill({ status: 503 });
        await page.route('**/__remote_gui/editable', focusUnavailable);
        try {
            await delay(700);
            assert.equal(await editorFocused(), true, 'the keyboard closed on a missed focus renewal');
            await paused.waitFor({ timeout: 1500 });
            const notice = await paused.boundingBox();
            const screen = await page.locator('#screen').boundingBox();
            assert.ok(notice && screen && notice.y + notice.height <= screen.y, 'the typing status covers the remote controls');
            await page.keyboard.insertText('x');
        } finally {
            await page.unroute('**/__remote_gui/editable', focusUnavailable);
        }
        await resumed.waitFor({ timeout: 1500 });
        assert.equal(await editorFocused(), true);
        const phaseUnavailable = async route => {
            await delay(450);
            await route.continue().catch(() => {});
        };
        await page.route('**/__remote_gui/editable-phase', phaseUnavailable);
        try {
            await paused.waitFor({ timeout: 1500 });
            assert.equal(await editorFocused(), true, 'a phase timeout closed the keyboard');
            await page.keyboard.insertText('q');
        } finally {
            await page.unroute('**/__remote_gui/editable-phase', phaseUnavailable);
        }
        await resumed.waitFor({ timeout: 1500 });
        const address = 'http://127.0.0.1:' + fixture.address().port + '/t';
        for (const character of address) await page.keyboard.insertText(character);
        await page.keyboard.press('Shift+ArrowLeft');
        await page.keyboard.insertText('s');
        const viewportAfterSubmit = [];
        const recordViewport = request => {
            if (request.url().endsWith('/__remote_gui/viewport')) viewportAfterSubmit.push(request.postDataJSON());
        };
        page.on('request', recordViewport);
        await page.keyboard.press('Enter');
        for (let attempt = 0; attempt < 35 && !observations.geometry; attempt++) await delay(100);
        assert.ok(observations.geometry, 'the corrected address did not load the expected page');
        // Safari can end the native input session before its visual viewport
        // reports that the keyboard has finished moving off screen.
        await editor.waitFor({ state: 'hidden', timeout: 3000 });
        await delay(350);
        assert.equal(await canvas.evaluate(node => node.height), 812, 'the remote framebuffer shrank during keyboard dismissal');
        assert.ok(viewportAfterSubmit.every(size => size.height === 812), 'the viewer resized the remote browser to the closing keyboard');
        const restore = page.waitForRequest(request => request.url().endsWith('/__remote_gui/viewport') && request.postDataJSON().height === 812);
        await page.evaluate(() => {
            delete window.visualViewport.height;
            window.visualViewport.dispatchEvent(new Event('resize'));
        });
        assert.equal((await restore).postDataJSON().claim, true, 'the restored viewport did not reclaim sizing');
        await page.waitForFunction(() => {
            const node = document.querySelector('#screen canvas');
            return node?.width === 390 && node.height === 812 && Math.abs(node.getBoundingClientRect().height - 812) < 1;
        });
        page.off('request', recordViewport);
        await delay(350);
        const { top } = observations.geometry;
        await tap(120, top + 340);
        await delay(550);
        assert.equal(await prompt.count(), 0);

        for (const [index, [html, mode]] of fields.entries()) {
            const point = { x: index % 2 === 0 ? 105 : 265, y: top + 405 + Math.floor(index / 2) * 60 };
            const reply = page.waitForResponse(async response => {
                if (!response.url().endsWith('/__remote_gui/editable') || !response.ok()) return false;
                const { x, y } = response.request().postDataJSON();
                if (Math.abs(x - point.x) > 2 || Math.abs(y - point.y) > 2) return false;
                return mode === null || await response.json() !== null;
            }, { timeout: 5500 });
            await tap(point.x, point.y);
            const field = await (await reply).json();
            assert.equal(field?.mode ?? null, mode, html);
            if (field) {
                assert.deepEqual(Object.keys(field).sort(), ['height', 'mode', 'phase', 'token', 'width', 'x', 'y']);
                assert.match(field.token, /^[a-f0-9]{24}$/);
                await prompt.waitFor({ timeout: 4000 });
                assert.equal(await editorFocused(), false);
            } else {
                await delay(500);
                assert.equal(await prompt.count(), 0);
            }
            await tap(120, top + 340);
        }

        await tap(130, top + 145);
        await prompt.waitFor({ timeout: 5500 });
        const focusedField = lastSample.field.token;
        await tap(264, top + 145);
        for (let i = 0; i < 40 && !observations.cover; i++) await delay(50);
        assert.deepEqual(observations.cover, { keptFocus: true });
        await prompt.waitFor({ timeout: 5500 });
        assert.equal(lastSample.field.token, focusedField);
        assert.equal(await editor.evaluate(node => document.activeElement === node), false);
        await delay(800);
        await prompt.tap({ timeout: 2000 });
        assert.equal(await editor.evaluate(node => document.activeElement === node), true);
        await delay(550);
        await page.keyboard.insertText('z');
        for (let i = 0; i < 70 && !observations.edit; i++) await delay(100);
        assert.deepEqual(observations.edit, { exact: true, count: 1 });

        const collected = await stopMonitor();
        stopMonitor = undefined;
        checkMobileBus(collected);

        let nextPhase = null;
        await page.route('**/__remote_gui/editable-phase', route => nextPhase === null
            ? route.continue() : route.fulfill({ json: nextPhase }));
        let holdLookup;
        const lookupHeld = new Promise(resolve => { holdLookup = resolve; });
        let finishLookup;
        const releaseLookup = new Promise(resolve => { finishLookup = resolve; });
        let staleField;
        await page.route('**/__remote_gui/editable', async route => {
            if (staleField) { await route.continue(); return; }
            staleField = lastSample;
            holdLookup();
            await releaseLookup;
            // The viewer can cancel the HTTP request as soon as the phase changes.
            await route.fulfill({ json: staleField.field }).catch(() => {});
        });
        try {
            await lookupHeld;
            assert.ok(staleField, 'no confirmed old-phase field');
            await editor.evaluate(node => {
                node.dispatchEvent(new CompositionEvent('compositionstart'));
                node.value = 'q';
            });
            nextPhase = staleField.field.phase + 1;
            for (let i = 0; i < 20 && await editor.evaluate(node => document.activeElement === node); i++) {
                await delay(10);
            }
            assert.equal(await editor.evaluate(node => document.activeElement === node), false);
            finishLookup();
            await editor.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend', { data: 'q' })));
            assert.ok(Date.now() < staleField.started + 500, 'old lease expired before the phase-race assertion');
            await delay(150);
            assert.equal(await prompt.count(), 0);
            assert.deepEqual(observations.edit, { exact: true, count: 1 });
        } finally {
            finishLookup();
        }

        await page.unroute('**/__remote_gui/editable');
        await page.unroute('**/__remote_gui/editable-phase');
        const readPhase = () => page.evaluate(async () => {
            const response = await fetch('/__remote_gui/editable-phase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Remote-Gui-Editable': '1' },
            });
            return response.ok ? await response.json() : null;
        });
        const originalPhase = await readPhase();
        assert.ok(Number.isSafeInteger(originalPhase));
        let handoffFinished = false;
        const handoff = promisify(execFile)(process.env.REMOTE_GUI_TEST_BINARY,
            ['handoff', session.id, '--browser-mode', 'agent', '--home', root, '--transport', 'loopback'],
            { encoding: 'utf8', timeout: 30000 })
            .then(({ stdout }) => JSON.parse(stdout))
            .finally(() => { handoffFinished = true; });
        try {
            let observedPhase = originalPhase;
            for (let i = 0; i < 25 && observedPhase === originalPhase; i++) {
                observedPhase = await readPhase();
                if (observedPhase === originalPhase) await delay(50);
            }
            assert.equal(observedPhase, originalPhase + 1);
            assert.equal(handoffFinished, false, 'phase endpoint waited for the live browser handoff');
        } finally {
            const result = await handoff;
            assert.equal(result.browser_mode, 'agent');
        }
        assert.equal(await page.getByText('Shared browser connected').count(), 1);
    } finally {
        try {
            if (stopMonitor) await stopMonitor().catch(() => {});
            if (browser) await browser.close();
            if (session) {
                const stopped = cli('stop', session.id);
                assert.equal(stopped.state, 'stopped', stopped.diagnostic);
            }
            safe = true;
        } finally {
            fixture.closeAllConnections();
            await new Promise(resolve => fixture.close(resolve));
            if (safe) rmSync(root, { recursive: true, force: true });
        }
    }
}, 90000);
