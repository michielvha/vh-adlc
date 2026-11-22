export type SmokeProfile = {
  target: "build" | "deployed";
  origin: string;
  mode: "report";
  httpUpgradeUrl?: string;
  chromium?: { caFile?: string };
  route: { path: string; visibleHeading: string; deadlineMs: number };
};

export function resolveProfile(profile: SmokeProfile) {
  const origin = new URL(profile.origin);
  const route = new URL(profile.route.path, origin);
  const upgrade = profile.httpUpgradeUrl ? new URL(profile.httpUpgradeUrl) : undefined;
  const credentials = (url: URL) => url.username || url.password || url.hash;
  const validOrigin = origin.origin === profile.origin && /^[a-z0-9.\-]+$/i.test(origin.hostname);
  if (!validOrigin || route.origin !== origin.origin || credentials(route) ||
      !profile.route.path.startsWith("/") || profile.route.path.startsWith("//") ||
      !profile.route.visibleHeading.trim() || !Number.isSafeInteger(profile.route.deadlineMs) ||
      profile.route.deadlineMs <= 0 || profile.mode !== "report" ||
      !["build", "deployed"].includes(profile.target) ||
      (profile.target === "deployed" && origin.protocol !== "https:") ||
      (profile.target === "build" && !["http:", "https:"].includes(origin.protocol))) {
    throw new Error("Invalid website smoke profile");
  }
  if (upgrade && (profile.target !== "deployed" || upgrade.protocol !== "http:" ||
      credentials(upgrade) || upgrade.hostname !== origin.hostname)) {
    throw new Error("Invalid HTTP upgrade URL");
  }
  return { origin, route, upgrade };
}
