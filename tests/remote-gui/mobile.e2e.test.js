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

const enabled = process.env.REMOTE_GUI_MOBILE_E2E === '1';
const requireModule = createRequire(import.meta.url);

test.skipIf(!enabled)('two inline taps edit a URL and a field through stock Chromium and noVNC', async () => {
    const { chromium } = requireModule(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE);
    const root = mkdtempSync(join(tmpdir(), 'rg-mobile-e2e-'));
    const observations = { geometry: null, edit: null };
    const fixture = createServer(async (request, response) => {
        const path = new URL(request.url, 'http://127.0.0.1').pathname;
        if (request.method === 'POST' && (path === '/geometry' || path === '/edit')) {
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
#plain{position:absolute;left:40px;top:310px}</style>
<input id="entry" aria-label="Synthetic text"><p id="plain">Plain area</p>
<script>
const field=document.querySelector('#entry');
let count=0;
function post(path,value){fetch(path,{method:'POST',body:JSON.stringify(value)})}
function geometry(){post('/geometry',{top:outerHeight-innerHeight})}
setTimeout(geometry,600);
addEventListener('resize',geometry);
field.addEventListener('input',()=>post('/edit',{exact:field.value==='z',count:++count}));
</script>`);
    });
    const cli = (...args) => JSON.parse(execFileSync(process.env.REMOTE_GUI_TEST_BINARY,
        [...args, '--home', root, '--transport', 'loopback'], { encoding: 'utf8', timeout: 40000 }));
    let session;
    let browser;
    let safe = false;
    try {
        await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
        session = cli('start', '--browser-mode', 'human', '--ttl', '4m');
        assert.equal(session.browser_mode, 'human');
        assert.equal(session.local_cdp ?? '', '');
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
        const address = 'http://127.0.0.1:' + fixture.address().port + '/t';
        for (const character of address) await page.keyboard.insertText(character);
        await page.keyboard.press('Shift+ArrowLeft');
        await page.keyboard.insertText('s');
        await page.keyboard.press('Enter');
        for (let attempt = 0; attempt < 35 && !observations.geometry; attempt++) await delay(100);
        assert.ok(observations.geometry, 'the corrected address did not load the expected page');
        await page.evaluate(() => {
            delete window.visualViewport.height;
            window.visualViewport.dispatchEvent(new Event('resize'));
        });
        await delay(350);
        const { top } = observations.geometry;
        await tap(120, top + 340);
        await delay(550);
        assert.equal(await prompt.count(), 0);
        await tap(130, top + 145);
        await prompt.waitFor({ timeout: 5500 });
        assert.equal(await editor.evaluate(node => document.activeElement === node), false);
        await delay(800);
        await prompt.tap({ timeout: 2000 });
        assert.equal(await editor.evaluate(node => document.activeElement === node), true);
        await delay(550);
        await page.keyboard.insertText('z');
        for (let i = 0; i < 70 && !observations.edit; i++) await delay(100);
        assert.deepEqual(observations.edit, { exact: true, count: 1 });

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
