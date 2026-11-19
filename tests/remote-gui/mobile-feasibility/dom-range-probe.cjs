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
            const main = document.body;
            const supported = {};
            const setRange = HTMLInputElement.prototype.setRangeText;
            const setAreaRange = HTMLTextAreaElement.prototype.setRangeText;
            for (const type of ['text', 'password', 'search', 'tel', 'url', 'email', 'number', 'textarea']) {
                const field = document.createElement(type === 'textarea' ? type : 'input');
                if (type !== 'textarea') field.type = type;
                main.append(field);
                const range = type === 'textarea' ? setAreaRange : setRange;
                const marker = type === 'number' ? '7' : 'z';
                try {
                    range.call(field, marker, 0, 0, 'end');
                    supported[type] = field.value === marker ? 'inserted' : 'wrong-value';
                } catch (error) {
                    supported[type] = error.name;
                }
            }
            const a = main.appendChild(document.createElement('input'));
            const b = main.appendChild(document.createElement('input'));
            let inputs = 0;
            let trusted = null;
            a.addEventListener('input', event => {
                inputs++;
                trusted = event.isTrusted;
            });
            function edit(target) {
                if (!target.isConnected || document.activeElement !== target) return 'cancelled-before';
                if (!target.dispatchEvent(new InputEvent('beforeinput', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertText',
                    data: 'z',
                }))) return 'cancelled-by-page';
                if (!target.isConnected || document.activeElement !== target) return 'cancelled-after';
                setRange.call(target, 'z', 0, 0, 'end');
                target.dispatchEvent(new InputEvent('input', {bubbles:true,inputType:'insertText',data:'z'}));
                return 'edited';
            }
            a.focus();
            const positive = edit(a);
            const positiveMatched = a.value === 'z' && b.value === '' && inputs === 1;
            a.value = '';
            b.focus();
            const stale = edit(a);
            a.focus();
            a.addEventListener('beforeinput', () => b.focus(), {once: true});
            const midEdit = edit(a);
            const cancelledWithoutMutation = a.value === '' && b.value === '' && inputs === 1;
            return {supported, positive, positiveMatched, stale, midEdit, cancelledWithoutMutation, trusted};
        });
        console.log(JSON.stringify(observed, null, 2));
        assert.equal(observed.positive, 'edited');
        assert.equal(observed.positiveMatched, true);
        assert.equal(observed.stale, 'cancelled-before');
        assert.equal(observed.midEdit, 'cancelled-after');
        assert.equal(observed.cancelledWithoutMutation, true);
    } finally {
        await browser.close();
    }
}
run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
