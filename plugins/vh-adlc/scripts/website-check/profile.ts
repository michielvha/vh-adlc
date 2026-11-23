import type { ExpectedResponse, RequiredRequest } from "./observations";

export type SmokeProfile = {
  target: "build" | "deployed";
  origin: string;
  mode: "report";
  httpUpgradeUrl?: string;
  chromium?: { caFile?: string };
  expectedResponses?: ExpectedResponse[];
  route: { path: string; visibleHeading: string; deadlineMs: number; requiredRequests?: RequiredRequest[] };
};

// Playwright's documented Request.resourceType() values.
const RESOURCE_TYPES = new Set([
  "document", "stylesheet", "image", "media", "font", "script", "texttrack", "xhr", "fetch",
  "eventsource", "websocket", "manifest", "other",
]);

function credentials(url: URL) {
  return url.username || url.password || url.hash;
}

/** A rule URL must be an exact, credential-free URL inside the profile's single allowed origin. */
function scopedRuleUrl(raw: unknown, origin: URL) {
  if (typeof raw !== "string") return false;
  try {
    const url = new URL(raw);
    return url.origin === origin.origin && !credentials(url);
  } catch {
    return false;
  }
}

function validMethod(method: unknown) {
  return typeof method === "string" && /^[A-Z]+$/.test(method);
}

export function resolveProfile(profile: SmokeProfile) {
  const origin = new URL(profile.origin);
  const route = new URL(profile.route.path, origin);
  const upgrade = profile.httpUpgradeUrl ? new URL(profile.httpUpgradeUrl) : undefined;
  const required = profile.route.requiredRequests ?? [];
  const expected = profile.expectedResponses ?? [];
  const validOrigin = origin.origin === profile.origin && /^[a-z0-9.\-]+$/i.test(origin.hostname);
  if (!validOrigin || route.origin !== origin.origin || credentials(route) ||
      !profile.route.path.startsWith("/") || profile.route.path.startsWith("//") ||
      !profile.route.visibleHeading.trim() || !Number.isSafeInteger(profile.route.deadlineMs) ||
      profile.route.deadlineMs <= 0 || profile.mode !== "report" ||
      !["build", "deployed"].includes(profile.target) ||
      (profile.target === "deployed" && origin.protocol !== "https:") ||
      (profile.target === "build" && !["http:", "https:"].includes(origin.protocol)) ||
      !Array.isArray(required) || !Array.isArray(expected) ||
      !required.every((rule) => validMethod(rule.method) && scopedRuleUrl(rule.url, origin)) ||
      !expected.every((rule) => validMethod(rule.method) && scopedRuleUrl(rule.url, origin) &&
        RESOURCE_TYPES.has(rule.resourceType) && Number.isSafeInteger(rule.status) && rule.status >= 100 && rule.status <= 599)) {
    throw new Error("Invalid website smoke profile");
  }
  if (upgrade && (profile.target !== "deployed" || upgrade.protocol !== "http:" ||
      credentials(upgrade) || upgrade.hostname !== origin.hostname)) {
    throw new Error("Invalid HTTP upgrade URL");
  }
  return { origin, route, upgrade, required, expected };
}
