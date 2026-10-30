// Match JSON.stringify(value, null, 2), retaining the exact line range of each node.
export function jsonEvidence(value: unknown) {
  const lines: string[] = [], ranges = new Map<string, { line: number; end_line: number }>();
  function emit(value: any, path: (string | number)[], depth: number, prefix: string, suffix: string) {
    const start = lines.length + 1, array = Array.isArray(value), entries = array ? value.map((item: any, index: number) => [index, item]) : value && typeof value === "object" ? Object.entries(value).filter(([, item]) => item !== undefined) : null;
    if (!entries?.length) lines.push(prefix + JSON.stringify(value) + suffix);
    else {
      lines.push(prefix + (array ? "[" : "{"));
      entries.forEach(([key, item]: any, index: number) => emit(item, [...path, key], depth + 1, "  ".repeat(depth + 1) + (array ? "" : JSON.stringify(key) + ": "), index === entries.length - 1 ? "" : ","));
      lines.push("  ".repeat(depth) + (array ? "]" : "}") + suffix);
    }
    ranges.set(JSON.stringify(path), { line: start, end_line: lines.length });
  }
  emit(value, [], 0, "", "");
  const text = lines.join("\n") + "\n";
  if (text !== JSON.stringify(value, null, 2) + "\n") throw Error("JSON evidence serialization differs");
  return { text, at: (...path: (string | number)[]) => { const range = ranges.get(JSON.stringify(path)); if (!range) throw Error("JSON evidence node missing"); return range; } };
}

export function coverageEvidence(inventory: any, id: string, encoded = jsonEvidence(inventory)) {
  const match = id.match(/^(?:coverage|history):([^:]+):(dependabot|code_scanning)$/);
  if (!match) return null;
  const index = inventory.repositories.findIndex((row: any) => row.repository === match[1]);
  if (index < 0) throw Error("scoped coverage repository missing");
  return encoded.at("repositories", index, match[2], "coverage");
}
