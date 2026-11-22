import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { confinedChromium } from "./chromium";
import { resolveProfile, type SmokeProfile } from "./profile";

export async function runWebsiteCheck(profile: SmokeProfile) {
  const { origin, route, upgrade } = resolveProfile(profile);
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
      scratch, origin, caFile: profile.chromium?.caFile, url: route,
      heading: profile.route.visibleHeading, deadlineMs: profile.route.deadlineMs,
    });
    return {
      mode: profile.mode, browser: "chromium", browserVersion: browser.browserVersion, exitCode: browser.incomplete ? 1 : 0,
      routeStatus: browser.routeStatus, visibleAssertion: browser.visibleAssertion,
      observations: [...upgradeObservations, ...browser.observations],
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
