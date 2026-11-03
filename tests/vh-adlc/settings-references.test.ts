// The settings references are the contract a person follows to configure triage and
// maintenance, so they must name only the YAML file and show examples that load.
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadSettings as loadTriage } from "../../plugins/vh-adlc/scripts/triage/settings";
import { loadSettings as loadMaintenance } from "../../plugins/vh-adlc/scripts/maintenance/settings";
import { fixture as triageFixture } from "./triage/fixtures";
import { fixture as maintenanceFixture } from "./maintenance/fixtures";
import { blockYAML } from "./settings-yaml";

const REFERENCES = resolve(import.meta.dir, "../../plugins/vh-adlc/references");
const disposals: (() => void)[] = [];
afterEach(() => { for (const dispose of disposals.splice(0)) dispose(); });

function examples(markdown: string): string[] {
  return [...markdown.matchAll(/^```yaml\n([\s\S]*?)^```$/gm)].map(match => match[1]);
}

const cases = [
  { name: "triage", page: "triage-settings.md", fixture: triageFixture, load: loadTriage, needs: { "plans/.keep": "" } },
  { name: "maintenance", page: "maintenance-settings.md", fixture: maintenanceFixture, load: loadMaintenance, needs: { "maintenance-project.md": "# Project procedure\n" } },
] as const;

for (const item of cases) {
  test(`${item.page} names only .vh-adlc/${item.name}.yaml`, () => {
    const text = readFileSync(join(REFERENCES, item.page), "utf8");
    expect(text).toContain(`.vh-adlc/${item.name}.yaml`);
    expect(text).not.toMatch(new RegExp(`\\.vh-adlc/${item.name}\\.(json|yml)\\b`));
    expect(text).not.toMatch(/```json\n/);
    expect(text).toMatch(/verified `?vh-adlc`? binary/);
    expect(text).not.toContain("creates no files");
  });

  test(`${item.page} shows a block YAML example that loads`, () => {
    const found = examples(readFileSync(join(REFERENCES, item.page), "utf8"));
    expect(found.length).toBe(1);
    const example = found[0];
    expect(() => JSON.parse(example)).toThrow();
    blockYAML(example);
    const f = item.fixture(); disposals.push(f.dispose);
    for (const [path, text] of Object.entries(item.needs)) f.write(path, text);
    f.write(`.vh-adlc/${item.name}.yaml`, example);
    const config = item.load(f.root);
    expect(config.configured).toBe(true);
    expect(config.settings_path).toBe(`.vh-adlc/${item.name}.yaml`);
  });
}
