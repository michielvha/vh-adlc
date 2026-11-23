import type { ExpectedResponse, RequiredRequest } from "./observations";
import schema from "./profile.schema.json";

export type SmokeProfile = {
  target: "build" | "deployed";
  origin: string;
  mode?: "report" | "enforce";
  browser?: "chromium";
  httpUpgradeUrl?: string;
  expectedResponses?: ExpectedResponse[];
  route: { path: string; visibleHeading: string; deadlineMs: number; requiredRequests?: RequiredRequest[] };
};

type Schema = {
  type?: "object" | "array" | "string" | "integer";
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
};

function invalid(reason: string): never {
  throw new Error(`Invalid website smoke profile: ${reason}`);
}

/** Check a value against profile.schema.json. Every object there is closed, so any undefined key is refused. */
function conform(rule: Schema, value: unknown, path: string) {
  const name = path || "profile";
  if (rule.enum && !rule.enum.includes(value)) {
    invalid(`${name} is ${JSON.stringify(value)}, expected ${rule.enum.map((v) => JSON.stringify(v)).join(" or ")}`);
  }
  if (rule.type === "string" && typeof value !== "string") invalid(`${name} must be a string`);
  if (rule.type === "integer" && !Number.isSafeInteger(value)) invalid(`${name} must be an integer`);
  if (rule.type === "array") {
    if (!Array.isArray(value)) invalid(`${name} must be a list`);
    value.forEach((item, index) => conform(rule.items ?? {}, item, `${name}[${index}]`));
  }
  if (rule.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(`${name} must be a mapping`);
    const properties = rule.properties ?? {};
    // A key set to undefined is absent, as in the JSON or YAML a profile is read from.
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    for (const [key] of entries) {
      if (!Object.hasOwn(properties, key)) invalid(`unknown key ${path ? `${path}.` : ""}${key}`);
    }
    for (const key of rule.required ?? []) {
      if (!entries.some(([name]) => name === key)) invalid(`missing key ${path ? `${path}.` : ""}${key}`);
    }
    for (const [key, item] of entries) conform(properties[key], item, path ? `${path}.${key}` : key);
  }
}

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

export function resolveProfile(input: unknown) {
  conform(schema as Schema, input, "");
  const profile = input as SmokeProfile;
  const mode = profile.mode ?? "report";
  // Enforcement needs an explicit policy, and no policy keys exist until the adapters add them.
  if (mode === "enforce") invalid("enforce mode requires a policy");
  const origin = new URL(profile.origin);
  const route = new URL(profile.route.path, origin);
  const upgrade = profile.httpUpgradeUrl ? new URL(profile.httpUpgradeUrl) : undefined;
  const required = profile.route.requiredRequests ?? [];
  const expected = profile.expectedResponses ?? [];
  const validOrigin = origin.origin === profile.origin && /^[a-z0-9.\-]+$/i.test(origin.hostname);
  if (!validOrigin || route.origin !== origin.origin || credentials(route) ||
      !profile.route.path.startsWith("/") || profile.route.path.startsWith("//") ||
      !profile.route.visibleHeading.trim() || !Number.isSafeInteger(profile.route.deadlineMs) ||
      profile.route.deadlineMs <= 0 ||
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
  return { profile, mode, origin, route, upgrade, required, expected };
}
