const assert = require('node:assert/strict');
const { chromium } = require(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE);

async function run() {
    const browser = await chromium.launch({
        executablePath: process.env.REMOTE_GUI_CHROMIUM,
        chromiumSandbox: true,
        args: ['--disable-gpu', '--disable-extensions'],
    });
    try {
        const context = await browser.newContext({serviceWorkers: 'block'});
        const page = await context.newPage();
        await page.goto('data:text/html,<!doctype html><title>Owned edit primitive comparison</title>');
        const observed = await page.evaluate(() => {
            const matrix = {};
            for (const type of ['text', 'password', 'search', 'tel', 'url', 'email', 'number', 'textarea', 'contenteditable']) {
                const field = document.createElement(type === 'contenteditable' ? 'div' : type === 'textarea' ? type : 'input');
                if (type === 'contenteditable') field.contentEditable = 'true';
                else if (type !== 'textarea') field.type = type;
                document.body.append(field);
                const events = [];
                for (const event of ['beforeinput', 'input']) {
                    field.addEventListener(event, e => events.push([event, e.isTrusted]));
                }
                field.focus();
                const marker = type === 'number' ? '7' : 'z';
                const returned = document.execCommand('insertText', false, marker);
                const matched = (type === 'contenteditable' ? field.textContent : field.value) === marker;
                matrix[type] = {returned,matched,events};
            }
            const a = document.body.appendChild(document.createElement('input'));
            const b = document.body.appendChild(document.createElement('input'));
            a.id = 'a'; b.id = 'b';
            const events = [];
            for (const node of [a,b]) {
                for (const type of ['beforeinput','input','focus']) {
                    node.addEventListener(type, e => events.push([node.id,type,e.isTrusted]));
                }
            }
            a.addEventListener('beforeinput', () => b.focus());
            a.focus();
            const next = document.execCommand('insertText', false, 'z');
            const result = {returned:next, a:a.value === 'z', b:b.value === 'z',
                            focused:document.activeElement.id, events:[...events]};
            a.value = '';
            b.value = '';
            a.focus();
            return {matrix, result};
        });
        await page.keyboard.insertText('z');
        const cdp = await page.evaluate(() => ({
            a:document.getElementById('a').value === 'z',
            b:document.getElementById('b').value === 'z',
            focused:document.activeElement.id,
        }));
        console.log(JSON.stringify({ ...observed, focusedCDPInsertion:cdp }, null, 2));
        assert.equal(observed.matrix.text.matched, true, 'fixture did not reach the browser editor');
    } finally {
        await browser.close();
    }
}
run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
