// The shared settings loader: which file it reads, which it refuses, and when it
// needs the verified vh-adlc binary.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { settingsFile } from "../../plugins/vh-adlc/scripts/settings-file";

const LOADER = resolve(import.meta.dir, "../../plugins/vh-adlc/scripts/settings-file.ts");
const made: string[] = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

function checkout(files: Record<string, string> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-settings-file-")));
  made.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
function fail(reason: string): never { throw Error(`invalid settings: ${reason}`); }
function load(root: string, settingsPath?: string) {
  return settingsFile({ root, name: "triage", settingsPath, inside: path => resolve(root, path), fail });
}
function refusal(run: () => unknown): string {
  try { run(); } catch (error) { return String(error); }
  throw Error("the loader accepted the file");
}

const yaml = "# Triage scope for this project.\nschema_version: 1\nsource_roots:\n  - src\nlabel_map:\n  bug: defect\n";

describe("the file the loader reads", () => {
  test("a block YAML file with a comment reads through the binary", () => {
    const root = checkout({ ".vh-adlc/triage.yaml": yaml });
    expect(load(root)).toEqual({ path: ".vh-adlc/triage.yaml", configured: true,
      value: { schema_version: 1, source_roots: ["src"], label_map: { bug: "defect" } } });
  });

  test("an explicit .yaml path is read in place of the default", () => {
    const root = checkout({ "config/triage.yaml": yaml });
    expect(load(root, "config/triage.yaml")).toMatchObject({ path: "config/triage.yaml", configured: true });
  });

  test.each(["json", "yml"])("a working-tree .vh-adlc/triage.%s fails naming the expected path", suffix => {
    const root = checkout({ [`.vh-adlc/triage.${suffix}`]: "schema_version: 1\n" });
    const message = refusal(() => load(root));
    expect(message).toContain(".vh-adlc/triage.yaml");
    expect(message).toContain(`.vh-adlc/triage.${suffix}`);
  });

  test.each(["json", "yml"])("a leftover .vh-adlc/triage.%s also fails when --settings selects a .yaml file", suffix => {
    const root = checkout({ [`.vh-adlc/triage.${suffix}`]: "{}\n", "config/triage.yaml": yaml });
    expect(refusal(() => load(root, "config/triage.yaml"))).toContain(".vh-adlc/triage.yaml");
  });

  test.each([".vh-adlc/triage.json", ".vh-adlc/triage.yml", "config/triage", "config/triage.YAML"])("an explicit path %s that does not end in .yaml fails", path => {
    const root = checkout({ [path]: yaml });
    expect(refusal(() => load(root, path))).toContain(".yaml");
  });

  test("an explicitly requested missing file fails", () => {
    expect(refusal(() => load(checkout(), "absent.yaml"))).toContain("missing");
  });
});

describe("YAML the reader refuses", () => {
  test.each([
    ["duplicate key", "schema_version: 1\nprivate-value: 1\nprivate-value: 2\n", "duplicate mapping key"],
    ["anchor", "schema_version: 1\nprivate-value: &a 1\n", "anchors and aliases are not accepted"],
    ["two documents", "schema_version: 1\n---\nprivate-value: 2\n", "more than one document"],
    ["top-level list", "- private-value\n", "top level is not a mapping"],
    ["syntax", "private-value: [unclosed\n", "invalid YAML syntax"],
  ])("a %s fails with the reader's fixed reason and no text from the file", (_name, text, reason) => {
    const message = refusal(() => load(checkout({ ".vh-adlc/triage.yaml": text })));
    expect(message).toContain(reason);
    expect(message).not.toContain("private-value");
  });
});

describe("binary availability", () => {
  // Runs the loader with an empty HOME, no vh-adlc on PATH and a proxy that refuses every
  // download, so the installer fails without reaching the network.
  function withoutBinary(root: string): { code: number | null; out: string; err: string } {
    const home = checkout();
    const script = `import { settingsFile } from ${JSON.stringify(LOADER)};
      const fail = (reason) => { throw Error("invalid settings: " + reason); };
      try { console.log(JSON.stringify(settingsFile({ root: ${JSON.stringify(root)}, name: "triage", inside: path => ${JSON.stringify(root)} + "/" + path, fail }))); }
      catch (error) { console.error(String(error)); process.exit(1); }`;
    const run = Bun.spawnSync([process.execPath, "-e", script], {
      env: { HOME: home, XDG_CACHE_HOME: join(home, "cache"), PATH: "/usr/bin:/bin", LC_ALL: "C",
        https_proxy: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", TMPDIR: tmpdir() },
      stdout: "pipe", stderr: "pipe", timeout: 60_000,
    });
    return { code: run.exitCode, out: run.stdout.toString().trim(), err: run.stderr.toString() };
  }

  test("with no settings file, defaults apply and no binary is needed", () => {
    const result = withoutBinary(checkout());
    expect({ code: result.code, err: result.err }).toEqual({ code: 0, err: "" });
    expect(JSON.parse(result.out)).toEqual({ path: ".vh-adlc/triage.yaml", configured: false, value: {} });
  }, 60_000);

  test("a .yaml read fails visibly when the installer cannot supply the binary", () => {
    const result = withoutBinary(checkout({ ".vh-adlc/triage.yaml": yaml }));
    expect(result.code).toBe(1);
    expect(result.err).toContain("binary unavailable");
    expect(result.out).toBe("");
  }, 60_000);
});
