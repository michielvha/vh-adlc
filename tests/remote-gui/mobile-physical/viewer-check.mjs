// Desktop viewer check for the physical rollback run. Usage:
//   [TOUCH=1] node viewer-check.mjs <playwright-core module dir> <viewer URL>...
// For each URL it reports whether noVNC drew a nonblank canvas, whether the
// viewer requested the mobile module, and the HTTP status of that request.
import {createRequire} from 'node:module';
const [moduleDir, ...urls] = process.argv.slice(2);
const {chromium} = createRequire(moduleDir + '/')('playwright-core');
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
for (const url of urls) {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}, hasTouch: process.env.TOUCH === '1'});
  let mobile = null;
  page.on('response', r => { if (r.url().includes('/__remote_gui/mobile.js')) mobile = r.status(); });
  const result = {url: url.replace(/\?.*/, '?…')};
  try {
    const nav = await page.goto(url, {waitUntil: 'load', timeout: 30000});
    result.status = nav?.status();
    await page.waitForTimeout(8000);
    Object.assign(result, await page.evaluate(() => {
      const c = document.querySelector('#noVNC_container canvas, canvas');
      if (!c || !c.width) return {canvas: false};
      const g = document.createElement('canvas'); g.width = 64; g.height = 64;
      const x = g.getContext('2d'); x.drawImage(c, 0, 0, 64, 64);
      const d = x.getImageData(0, 0, 64, 64).data; const seen = new Set();
      for (let i = 0; i < d.length; i += 4) seen.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]);
      return {canvas: true, width: c.width, height: c.height, colors: seen.size,
        keyboardButton: !!document.querySelector('#noVNC_keyboard_button:not(.noVNC_hidden)')};
    }));
  } catch (e) { result.error = String(e.message).split('\n')[0]; }
  result.mobileModule = mobile;
  console.log(JSON.stringify(result));
  await page.close();
}
await browser.close();
