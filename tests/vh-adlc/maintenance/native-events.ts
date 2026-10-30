export function parseNativeEvents(raw: string, interrupted: boolean) {
  const lines = raw.split("\n"), events: any[] = []; let terminal_fragment: string | null = null;
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    try { const value = JSON.parse(line); if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.type !== "string") throw Error("native event object required"); events.push(value); }
    catch {
      if (!interrupted || index !== lines.length - 1 || raw.endsWith("\n")) throw Error("malformed native event stream");
      terminal_fragment = line;
    }
  }
  return { events, terminal_fragment, complete: terminal_fragment === null };
}
