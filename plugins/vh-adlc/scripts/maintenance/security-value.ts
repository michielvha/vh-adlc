/** Runtime boundaries shared by security evidence readers. No input is executable. */
export function record(value: unknown, allowed?: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("security evidence expects an object");
  const result = value as Record<string, unknown>;
  if (allowed && Object.keys(result).some(key => !allowed.includes(key))) throw Error("security evidence has unsupported fields");
  return result;
}
export function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) throw Error("security evidence expects nonempty text");
  return value;
}
export function nullable(value: unknown): string | null { return value === null ? null : text(value); }
export function list(value: unknown): unknown[] { if (!Array.isArray(value)) throw Error("security evidence expects a list"); return value; }
export function strings(value: unknown): string[] {
  const result = list(value).map(text); if (new Set(result).size !== result.length) throw Error("duplicate security evidence values"); return result;
}
export function flag(value: unknown): boolean { if (typeof value !== "boolean") throw Error("security evidence expects a boolean"); return value; }
export function integer(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw Error("security evidence expects an integer"); return Number(value);
}
export function hash(value: unknown): string { const result = text(value); if (!/^[a-f0-9]{64}$/.test(result)) throw Error("security digest invalid"); return result; }
export function commit(value: unknown): string { const result = text(value); if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(result)) throw Error("security commit invalid"); return result; }
export function timestamp(value: unknown): string { const result = text(value); if (!Number.isFinite(Date.parse(result))) throw Error("security timestamp invalid"); return result; }
export function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw Error("unsupported security evidence value"); return value as T;
}
export function identity(hostname: unknown, repository: unknown): { hostname: string; repository: string } {
  const host = text(hostname), repo = text(repository);
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) || !/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9_.-]*$/.test(repo)) throw Error("security repository identity invalid");
  return { hostname: host, repository: repo };
}
