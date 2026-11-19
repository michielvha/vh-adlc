import type { Facts } from "./types";

export function identity(value: string): string { const u = new URL(value); u.hash = ""; return u.href; }
export function resolveLink(value: string, base: string): { target: string | null; fragment: string | null } {
  try {
    const u = new URL(value, base);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return { target: null, fragment: null };
    const at = u.href.indexOf("#");
    return { target: identity(u.href), fragment: at < 0 ? null : u.href.slice(at + 1) };
  } catch { return { target: null, fragment: null }; }
}
export function documentBase(finalUrl: string, firstBase: string | undefined): string {
  if (firstBase === undefined) return finalUrl;
  try { const u = new URL(firstBase, finalUrl); return ["data:", "javascript:"].includes(u.protocol) ? finalUrl : u.href; } catch { return finalUrl; }
}
export function resolveFragment(facts: Pick<Facts, "ids" | "named_anchors">, fragment: string): "valid" | "missing" | "unverified" {
  if (fragment === "") return "valid";
  if (fragment.includes(":~:")) return "unverified";
  const match = (v: string) => facts.ids.includes(v) || facts.named_anchors.includes(v);
  if (match(fragment)) return "valid";
  let decoded: string;
  try { decoded = decodeURIComponent(fragment); } catch { return "unverified"; }
  return match(decoded) || decoded.toLowerCase() === "top" ? "valid" : "missing";
}
