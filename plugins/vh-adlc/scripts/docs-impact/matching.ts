/** Coverage matching is separate from the feature gate's path.Match semantics. */
type Token =
  | { kind: "literal"; value: string }
  | { kind: "one" }
  | { kind: "class"; ranges: Array<[number, number]>; negated: boolean }
  | { kind: "star"; separators: boolean }
  | { kind: "directories" };

function malformed(): never { throw new Error("invalid coverage pattern"); }

/** Compile once per declaration; matching uses bounded dynamic programming, not backtracking. */
export function compileCoverage(pattern: string): (source: string) => boolean {
  const normalized = pattern.replace(/^(?:\.\/)+/u, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.includes("//") || normalized.split("/").includes("..")) malformed();
  const chars = Array.from(normalized), tokens: Token[] = [];
  let at = 0;
  while (at < chars.length) {
    const char = chars[at++];
    if (char === "\\") {
      if (at === chars.length) malformed();
      tokens.push({ kind: "literal", value: chars[at++] });
    } else if (char === "*") {
      const start = at - 1;
      while (chars[at] === "*") at++;
      const separators = at - start >= 2;
      if (separators && (start === 0 || chars[start - 1] === "/") && chars[at] === "/") {
        tokens.push({ kind: "directories" }); at++;
      } else tokens.push({ kind: "star", separators });
    } else if (char === "?") tokens.push({ kind: "one" });
    else if (char === "[") {
      const negated = chars[at] === "^";
      if (negated) at++;
      const ranges: Array<[number, number]> = [];
      const read = (): number => {
        if (at >= chars.length || chars[at] === "-" || chars[at] === "]") malformed();
        if (chars[at] === "\\") { at++; if (at >= chars.length) malformed(); }
        const value = chars[at++].codePointAt(0);
        if (value === undefined) malformed();
        return value;
      };
      while (true) {
        if (chars[at] === "]" && ranges.length > 0) { at++; break; }
        const low = read(); let high = low;
        if (chars[at] === "-") { at++; high = read(); }
        ranges.push([low, high]);
        if (at >= chars.length) malformed();
      }
      tokens.push({ kind: "class", ranges, negated });
    } else tokens.push({ kind: "literal", value: char });
  }
  const directory = normalized.endsWith("/");
  const firstOperator = tokens.findIndex(token => token.kind !== "literal");
  const prefix = tokens.slice(0, firstOperator < 0 ? tokens.length : firstOperator)
    .map(token => token.kind === "literal" ? token.value : "").join("");
  if (!directory && firstOperator < 0) return source => source === prefix;
  const remainder = tokens.slice(firstOperator);
  if (!directory && remainder.length === 1 && remainder[0].kind === "star" && remainder[0].separators) return source => source.startsWith(prefix);
  return source => {
    if (prefix && !((directory ? source + "/" : source).startsWith(prefix))) return false;
    const input = Array.from(directory ? source + "/" : source);
    let states = new Uint8Array(input.length + 1); states[0] = 1;
    for (const token of tokens) {
      const next = new Uint8Array(input.length + 1);
      if (token.kind === "star") {
        next.set(states);
        for (let i = 0; i < input.length; i++) if (next[i] && (token.separators || input[i] !== "/")) next[i + 1] = 1;
      } else if (token.kind === "directories") {
        next.set(states); let reachable = false;
        for (let i = 0; i < input.length; i++) {
          reachable ||= states[i] === 1;
          if (reachable && input[i] === "/") next[i + 1] = 1;
        }
      } else {
        for (let i = 0; i < input.length; i++) {
          if (!states[i]) continue;
          const char = input[i]; let matches = false;
          if (token.kind === "literal") matches = char === token.value;
          else if (token.kind === "one") matches = char !== "/";
          else {
            const point = char.codePointAt(0);
            const member = point !== undefined && token.ranges.some(([low, high]) => low <= point && point <= high);
            matches = char !== "/" && member !== token.negated;
          }
          if (matches) next[i + 1] = 1;
        }
      }
      states = next;
    }
    if (directory) return states.some((active, i) => active === 1 && i > 0 && input[i - 1] === "/");
    return states[input.length] === 1;
  };
}
