const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const { chromium } = require(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE);
const home = mkdtempSync(join(tmpdir(), 'rg-focus-race-session-'));
const cli = (...args) => JSON.parse(execFileSync(
    process.env.REMOTE_GUI_TEST_BINARY,
    [...args, '--home', home, '--transport', 'loopback'],
    {encoding: 'utf8', timeout: 35000},
));

const moveDuringKey = process.argv.includes('--during-key');
const fixture = `<!doctype html><meta charset="utf-8"><title>Owned focus race fixture</title>
<label>Field A <input id="a"></label>
<label>Field B <input id="b"></label>
<script>
const fields = [document.getElementById("a"), document.getElementById("b")];
for (const field of fields) {
    for (const event of ["focus", "input"]) {
        field.addEventListener(event, () => {
            fetch("/observed?event="+event+"&target="+field.id, {method:"POST"});
        });
    }
}
let moved = false;
const moveDuringKey = ${moveDuringKey};
fields[0].addEventListener("keydown", () => {
    if (moveDuringKey && moved) fields[1].focus();
});
setInterval(async () => {
    const requested = await fetch("/move", {cache:"no-store"}).then(r => r.text());
    if (requested === "yes" && !moved) {
        moved = true;
        if (moveDuringKey && document.activeElement === fields[0]) {
            fetch("/observed?event=armed&target=a", {method:"POST"});
        } else if (!moveDuringKey) {
            fields[1].focus();
        }
    }
}, 45);
fields[0].focus();
</script>`;

const observations = [];
let move = false;
const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'GET' && url.pathname === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        return response.end(fixture);
    }
    if (request.method === 'GET' && url.pathname === '/move') return response.end(move ? 'yes' : 'no');
    if (request.method === 'POST' && url.pathname === '/observed') {
        const event = url.searchParams.get('event');
        const target = url.searchParams.get('target');
        if (!['focus', 'input', 'armed'].includes(event) || !['a', 'b'].includes(target)) {
            return response.writeHead(400).end();
        }
        observations.push({event, target});
        return response.end('ok');
    }
    response.writeHead(404).end();
});

async function waitFor(condition, failure) {
    for (let index = 0; index < 240; index++) {
        const result = condition();
        if (result) return result;
        await delay(50);
    }
    throw new Error(failure);
}

async function run() {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let session, viewer;
    try {
        session = cli('start', '--browser-mode', 'human', '--ttl', '4m');
        assert.equal(session.browser_mode, 'human');
        assert.ok(!session.local_cdp, 'the human browser exposed debugging');
        const access = cli('access', session.id, '--reveal');
        viewer = await chromium.launch({
            executablePath: process.env.REMOTE_GUI_CHROMIUM,
            headless: true,
            chromiumSandbox: true,
            args: ['--disable-gpu'],
        });
        const context = await viewer.newContext({
            serviceWorkers: 'block',
            viewport: {width: 1440, height: 950},
            httpCredentials: {username: 'viewer', password: access.access_code, origin: new URL(session.url).origin},
        });
        const page = await context.newPage();
        await page.goto(session.url, {waitUntil: 'domcontentloaded'});
        await page.getByRole('link', {name: 'Open session'}).click();
        await page.locator('#status').filter({hasText: 'Shared browser connected'}).waitFor({timeout: 15000});
        await page.locator('canvas').focus();
        await page.keyboard.press('Control+t');
        await page.keyboard.type(`http://127.0.0.1:${server.address().port}/`, {delay: 35});
        await page.keyboard.press('Enter');
        await waitFor(() => observations.some(event => event.event === 'focus' && event.target === 'a'),
                      'owned fixture did not acknowledge initial field focus');

        await page.keyboard.press('k');
        const firstInput = await waitFor(() => observations.find(event => event.event === 'input'),
                                         'the control keystroke did not reach the fixture');
        assert.equal(firstInput.target, 'a');
        console.log('Control: one real noVNC keystroke reached the acknowledged field A.');

        // No viewer acts during this gap. The owned fixture itself moves focus.
        move = true;
        if (moveDuringKey) {
            await waitFor(() => observations.some(event => event.event === 'armed' && event.target === 'a'),
                          'the page did not acknowledge readiness with A still focused');
            console.log('Field A remained focused before sending the next key. The fixture will move focus inside its keydown handler.');
        } else {
            await waitFor(() => observations.some(event => event.event === 'focus' && event.target === 'b'),
                          'owned fixture failed to move focus after A was acknowledged');
            console.log('The page moved focus to B after the acknowledgement and before the next RFB key.');
        }
        const afterMove = observations.length;
        await page.keyboard.press('k');
        const input = await waitFor(() => observations.slice(afterMove).find(event => event.event === 'input'),
                                    'the second keystroke did not arrive');
        if (moveDuringKey) {
            assert.ok(observations.slice(afterMove).some(event => event.event === 'focus' && event.target === 'b'),
                      'focus did not move during the key');
        }
        console.log(`Observed destination of the key sent with the old acknowledgement: ${input.target.toUpperCase()}`);
        assert.equal(input.target, 'a', 'F1: global RFB input reached B after the binding acknowledged A');
    } finally {
        try {
            if (viewer) await viewer.close();
        } finally {
            try {
                if (session) {
                    const stopped = cli('stop', session.id);
                    assert.equal(stopped.state, 'stopped', 'owned browser did not stop');
                }
            } finally {
                await new Promise(resolve => server.close(resolve));
            }
        }
    }
}
run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
