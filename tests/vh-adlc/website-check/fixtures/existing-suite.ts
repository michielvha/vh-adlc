import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { pinnedPlaywrightVersion } from "../../../../plugins/vh-adlc/scripts/website-check/chromium";

type Browser = {
  newPage(): Promise<{
    route(path: string, handle: (route: {
      fulfill(response: { status: number; body: string; contentType: string }): Promise<void>;
    }) => Promise<void>): Promise<void>;
    goto(url: string): Promise<unknown>;
    evaluate<T>(predicate: () => T): Promise<T>;
  }>;
  close(): Promise<void>;
};

export async function existingSuiteMasksServiceFailure(origin: string) {
  const modulePath = process.env.WEBSITE_CHECK_PLAYWRIGHT_MODULE;
  if (!modulePath) throw new Error("Set WEBSITE_CHECK_PLAYWRIGHT_MODULE to the pinned playwright-core entry point");
  const metadata: unknown = JSON.parse(await readFile(join(dirname(modulePath), "package.json"), "utf8"));
  const pinned = await pinnedPlaywrightVersion();
  if (typeof metadata !== "object" || metadata === null || !("version" in metadata) || metadata.version !== pinned) {
    throw new Error(`The existing-suite fixture needs playwright-core ${pinned}`);
  }
  const { chromium }: { chromium: { launch(): Promise<Browser> } } = await import(modulePath);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route("**/service.js", (route) => route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "document.querySelector('h1').textContent = 'Service ready';",
    }));
    await page.goto(`${origin}/service`);
    return await page.evaluate(() => document.querySelector("h1")?.textContent);
  } finally {
    await browser.close();
  }
}
