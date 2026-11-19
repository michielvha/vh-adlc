import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const enabled = process.env.REMOTE_GUI_MOBILE_E2E === '1';
const requireModule = createRequire(import.meta.url);

test.skipIf(!enabled)('two inline taps and one key through stock Chromium and noVNC', async () => {
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
        if (request.method !== 'GET' || path !== '/') {
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
        let lastSample;
        page.on('response', async response => {
            if (response.ok() && response.url().endsWith('/__remote_gui/editable')) {
                const field = await response.json();
                if (field) lastSample = { field, started: response.request().timing().startTime };
            }
        });
        await page.goto(session.url);
        await page.getByRole('link', { name: 'Open session' }).click();
        await page.getByText('Shared browser connected').waitFor({ timeout: 15000 });
        const canvas = page.locator('#screen canvas');
        await canvas.click({ position: { x: 18, y: 140 } });
        for (let attempt = 0; attempt < 3 && !observations.geometry; attempt++) {
            await canvas.focus();
            await page.keyboard.press('Control+l');
            await page.keyboard.type('http://127.0.0.1:' + fixture.address().port + '/', { delay: 14 });
            await page.keyboard.press('Enter');
            await delay(850);
        }
        assert.ok(observations.geometry, 'synthetic page did not start');
        await delay(350);
        const bounds = await canvas.boundingBox();
        const [width, height] = await canvas.evaluate(node => [node.width, node.height]);
        const { top } = observations.geometry;
        const tap = (x, y) => page.touchscreen.tap(bounds.x + x * bounds.width / width, bounds.y + y * bounds.height / height);
        const prompt = page.getByRole('button', { name: 'Tap to type' });
        const editor = page.locator('#mobile-editor');
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
    } finally {
        try {
            if (browser) await browser.close();
            if (session) assert.equal(cli('stop', session.id).state, 'stopped');
            safe = true;
        } finally {
            fixture.closeAllConnections();
            await new Promise(resolve => fixture.close(resolve));
            if (safe) rmSync(root, { recursive: true, force: true });
        }
    }
}, 90000);
