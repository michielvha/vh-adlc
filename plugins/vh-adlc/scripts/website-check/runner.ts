import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { confinedChromium } from "./chromium";
import { resolveProfile } from "./profile";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * Run the smoke check for one profile. `fixtureCaFile` exists for the tests: it is trusted only for a
 * loopback origin, so it can never weaken certificate validation for a real site.
 */
export async function runWebsiteCheck(input: unknown, options: { fixtureCaFile?: string } = {}) {
  const { profile, mode, origin, route, upgrade, required, expected } = resolveProfile(input);
  if (options.fixtureCaFile !== undefined && !LOOPBACK_HOSTS.has(origin.hostname)) {
    throw new Error("Invalid website smoke run: a fixture CA is accepted only for a loopback origin");
  }
  const scratch = await mkdtemp(join(tmpdir(), "website-check-"));
  try {
    const upgradeObservations = [];
    if (upgrade) {
      const response = await fetch(upgrade, {
        redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(profile.route.deadlineMs),
      });
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location || response.status < 300 || response.status >= 400 || new URL(location, upgrade).href !== route.href) {
        throw new Error("HTTP upgrade did not select the configured HTTPS route");
      }
      upgradeObservations.push({ kind: "http-upgrade", status: response.status, path: upgrade.pathname });
    }
    const browser = await confinedChromium({
      scratch, origin, caFile: options.fixtureCaFile, url: route,
      heading: profile.route.visibleHeading, deadlineMs: profile.route.deadlineMs, rules: { required, expected },
    });
    // Report mode: a completed run exits zero even with findings; incomplete required coverage never does.
    return {
      mode, browser: "chromium", browserVersion: browser.browserVersion,
      exitCode: browser.coverage === "complete" ? 0 : 1,
      routeStatus: browser.routeStatus, visibleAssertion: browser.visibleAssertion,
      coverage: browser.coverage, boundary: browser.boundary,
      observations: [...upgradeObservations, ...browser.observations], rules: browser.rules,
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
