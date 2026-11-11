// Settings fixtures are written the way a person writes them: block YAML under a
// comment line. Pretty-printed JSON is valid YAML too, so a renamed JSON file would
// pass every loader test; blockYAML refuses to produce one.

export const SETTINGS_COMMENT = "# Fixture settings, written the way a person edits them.";

/** Throws unless text holds a comment line and its other lines are block YAML, not JSON. */
export function blockYAML(text: string): string {
  const lines = text.split("\n");
  if (!lines.some(line => line.trimStart().startsWith("#"))) throw Error("settings fixture has no comment line");
  const body = lines.filter(line => !line.trimStart().startsWith("#")).join("\n");
  let json = true;
  try { JSON.parse(body); } catch { json = false; }
  if (json || /^\s*[{[]/.test(body)) throw Error("settings fixture is JSON or a flow collection, not block YAML");
  return text;
}

/** The YAML text a fixture writes for value. A nonempty mapping is checked as block style. */
export function settingsYAML(value: unknown): string {
  const text = `${SETTINGS_COMMENT}\n${Bun.YAML.stringify(value, null, 2).trimEnd()}\n`;
  const mapping = !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
  return mapping ? blockYAML(text) : text;
}
