// The shared settings loader: which file it reads, which it refuses, and when it
// needs the verified vh-adlc binary.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { createYAMLReader, settingsFile } from "../../plugins/vh-adlc/scripts/settings-file";

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

describe("an offline reader session", () => {
  test("verifies once and uses the real strict reader for several documents", () => {
    const probe = checkout(), bin = join(probe, "bin"), counter = join(probe, "resolutions");
    mkdirSync(bin);
    const wrapper = join(bin, "bash");
    writeFileSync(wrapper, '#!/bin/bash\nprintf "resolve\\n" >> "$VH_DOCS_READER_COUNTER"\nexec /bin/bash "$@"\n');
    chmodSync(wrapper, 0o700);
    const source = `import { createYAMLReader } from ${JSON.stringify(LOADER)};
      const read = createYAMLReader(reason => { throw Error(reason); }, { offline: true });
      console.log(JSON.stringify([read(new TextEncoder().encode("covers: [src/**]\\n")), read(new TextEncoder().encode("description: second\\n"))]));`;
    const run = Bun.spawnSync([process.execPath, "-e", source], {
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`, VH_DOCS_READER_COUNTER: counter },
      stdout: "pipe", stderr: "pipe", timeout: 30_000,
    });
    expect(run.exitCode).toBe(0);
    expect(JSON.parse(run.stdout.toString())).toEqual([{ covers: ["src/**"] }, { description: "second" }]);
    expect(readFileSync(counter, "utf8")).toBe("resolve\n");
  });

  test("a refused document exposes no YAML values and does not poison the next read", () => {
    const read = createYAMLReader(fail, { offline: true }), bytes = (text: string) => new TextEncoder().encode(text);
    expect(refusal(() => read(bytes("private-value: 1\nprivate-value: 2\n")))).toContain("duplicate mapping key");
    expect(refusal(() => read(bytes("private-value: 1\nprivate-value: 2\n")))).not.toContain("private-value");
    expect(read(bytes("covers: [deploy/**]\n"))).toEqual({ covers: ["deploy/**"] });
  });

  test("an unavailable offline binary causes no download or cache installation", () => {
    const probe = checkout(), scripts = join(probe, "plugin", "scripts"), bin = join(probe, "bin"), network = join(probe, "network-used");
    mkdirSync(scripts, { recursive: true }); mkdirSync(bin);
    writeFileSync(join(scripts, "settings-file.ts"), readFileSync(LOADER));
    writeFileSync(join(scripts, "ensure-vh-adlc.sh"), readFileSync(resolve(dirname(LOADER), "ensure-vh-adlc.sh")));
    const lock = JSON.parse(readFileSync(resolve(dirname(LOADER), "../vh-adlc.lock.json"), "utf8"));
    // This unavailable version is a synthetic fixture, not a published dependency.
    lock.version = `99999.${process.pid}.0`;
    writeFileSync(join(probe, "plugin", "vh-adlc.lock.json"), JSON.stringify(lock, null, 2) + "\n");
    writeFileSync(join(bin, "curl"), '#!/bin/bash\nprintf "unexpected download\\n" > "$VH_DOCS_NETWORK_SENTINEL"\nexit 90\n');
    chmodSync(join(bin, "curl"), 0o700);
    const source = `import { createYAMLReader } from ${JSON.stringify(join(scripts, "settings-file.ts"))};
      try { createYAMLReader(reason => { throw Error(reason); }, { offline: true }); process.exit(3); }
      catch (error) { console.error(String(error)); process.exit(2); }`;
    const run = Bun.spawnSync([process.execPath, "-e", source], {
      env: { ...process.env, XDG_CACHE_HOME: join(probe, "cache"), PATH: `${bin}${delimiter}/usr/bin${delimiter}/bin`, VH_DOCS_NETWORK_SENTINEL: network },
      stdout: "pipe", stderr: "pipe", timeout: 30_000,
    });
    expect(run.exitCode).toBe(2);
    expect(run.stderr.toString()).toContain("binary unavailable");
    expect(existsSync(network)).toBe(false);
    expect(existsSync(join(probe, "cache"))).toBe(false);
  });
});

describe("the file the loader reads", () => {
  test("a block YAML file with a comment reads through the binary", () => {
    const root = checkout({ ".vh-adlc/triage.yaml": yaml });
    expect(load(root)).toEqual({ path: ".vh-adlc/triage.yaml", configured: true,
      value: { schema_version: 1, source_roots: ["src"], label_map: { bug: "defect" } } });
  });

  test("Stackweaver's triage settings read with every label_map entry intact", () => {
    const copy = readFileSync(resolve(import.meta.dir, "triage/stackweaver-triage.yaml"), "utf8");
    const value = load(checkout({ ".vh-adlc/triage.yaml": copy })).value as { label_map: Record<string, string> };
    expect(value.label_map).toEqual({ bug: "bug", enhancement: "enhancement", documentation: "documentation",
      refactor: "refactor", security: "security", "major-upgrade": "major-upgrade" });
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
