import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { collect, type Inventory } from "../../../plugins/vh-adlc/scripts/maintenance/collect";
import { renderReport } from "../../../plugins/vh-adlc/scripts/maintenance/report";
import { parseObservation } from "../../../plugins/vh-adlc/scripts/maintenance/history";
import { main } from "../../../plugins/vh-adlc/scripts/maintenance/cli";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/maintenance/settings";
import { digest, readRun } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { verifySecurityResult } from "../../../plugins/vh-adlc/scripts/maintenance/security-io";
import { GitHubReadError, type GitHubReader } from "../../../plugins/vh-adlc/scripts/github-read";
import { handle, type FakeState } from "../security-settings/fake-gh";
import { dispose, recordRun, setup } from "../security-settings/harness";
import type { Entry, Output } from "../../../plugins/vh-adlc/scripts/security-settings/security-settings";

afterEach(dispose);
const cliPath = resolve(import.meta.dir, "../../../plugins/vh-adlc/scripts/maintenance/cli.ts");
const satellites = ["example/second", "example/third", "example/fourth"];
const scoped = (names: string[]) => ({ security_settings: "apply", repositories: names.map(repository => ({ repository, role: "independent" })) });

type Answer = { value: unknown } | { status: number; message: string };
type Surface = (fake: FakeState, repository: string) => unknown[] | { status: number; message: string };
/** Serves the collector's GETs from the same fake state the helper wrote to. Other repositories in scope are public and empty. */
function reader(fake: FakeState, routes: { dependabot?: Surface; code_scanning?: Surface } = {}): GitHubReader {
  const surface = (value: ReturnType<Surface>): Answer => Array.isArray(value) ? { value } : value;
  const answer = (endpoint: string): Answer => {
    const route = endpoint.split("?")[0]!, match = route.match(/^repos\/([^/]+\/[^/]+)(\/.*)?$/);
    if (!match) return { status: 404, message: "Not Found" };
    const repository = match[1]!, rest = match[2] ?? "";
    if (rest === "") {
      if (repository !== fake.repository) return { value: { id: 7, full_name: repository, default_branch: "main", visibility: "public", private: false, permissions: { admin: true }, security_and_analysis: null } };
      const { reply } = handle(fake, ["api", "--hostname", fake.hostname, "--method", "GET", route], null);
      return reply.code ? { status: Number(/HTTP (\d{3})/.exec(reply.stderr)?.[1]), message: "Fixture failure" } : { value: { id: 42, ...JSON.parse(reply.stdout) } };
    }
    if (rest === "/pulls") return { value: [] };
    if (rest === "/dependabot/alerts") return surface(routes.dependabot?.(fake, repository) ?? []);
    if (rest === "/code-scanning/alerts") return surface(routes.code_scanning?.(fake, repository) ?? []);
    return { status: 404, message: "Not Found" };
  };
  return {
    get(endpoint: string) { const result = answer(endpoint); if ("value" in result) return result.value; throw new GitHubReadError(result.status, result.message); },
    pages(endpoint: string) {
      const result = answer(endpoint);
      return "value" in result ? { items: result.value as unknown[], pages: 1, complete: true } : { items: [], pages: 1, complete: false, error: { status: result.status, message: result.message } };
    },
    trace: () => [],
  } as unknown as GitHubReader;
}
const alert = (number: number) => ({ number, state: "open", dependency: { package: { ecosystem: "npm", name: `package-${number}` }, manifest_path: "package-lock.json", version_requirement: "1.0.0" },
  security_advisory: { ghsa_id: `GHSA-aaaa-bbbb-000${number}`, severity: "high", summary: "Advisory" } });
const three = [alert(1), alert(2), alert(3)];

type Project = ReturnType<typeof setup>;
function save(f: Project, name: string, value: unknown) {
  const path = join(f.root, ".tools", name);
  mkdirSync(join(f.root, ".tools"), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
  return path;
}
function output(repository: string, run_id: string, mode: "check" | "apply", entries: Entry[]): Output {
  return { schema_version: 1, repository, hostname: "github.com", run_id, command: mode, mode, mode_reason: mode === "apply" ? "adopted" : "not-adopted",
    visibility: "public", archived: false, admin: true, detection: { renovate: { status: "none" }, dependabot: { status: "not-configured" } }, entries };
}
const enabled = (repository: string, run_id: string) => output(repository, run_id, "apply", [{ setting: "dependabot_alerts", state: "enabled" }]);
const section = (text: string) => {
  const start = text.indexOf("## Repository security settings"), end = text.indexOf("\n## ", start + 1);
  return start < 0 ? "" : text.slice(start, end < 0 ? undefined : end);
};
const subsection = (text: string, repository: string) => {
  const body = section(text), start = body.indexOf(`### ${repository}\n`), end = body.indexOf("\n### ", start + 1);
  const tail = body.indexOf("\nOwner decisions:", start + 1);
  return start < 0 ? "" : body.slice(start, [end, tail].filter(index => index > 0).sort((a, b) => a - b)[0]);
};

test.each([
  ["private", 403], ["private", 404], ["internal", 403],
] as const)("a %s admin repository without either paid feature whose code scanning read returns %i is complete-unavailable", (visibility, status) => {
  const f = setup({ visibility, analysis_null: true });
  const inventory = collect(loadSettings(f.root), { reader: reader(f.fake, { code_scanning: () => ({ status, message: "Advanced Security must be enabled" }) }) });
  const surface = inventory.repositories[0]!.code_scanning;
  expect(surface.alerts).toBeNull();
  expect(surface.coverage).toMatchObject({ status: "complete-unavailable", count: null, reason: "not-free-on-private", http_status: status });
});

test.each([
  ["a public repository", { visibility: "public" }],
  ["a private repository read without admin", { visibility: "private", admin: false }],
  ["a private repository with code_security enabled", { visibility: "private", code_security: true }],
  ["a private repository with only advanced_security enabled", { visibility: "private", advanced_security: true }],
] as const)("the same 403 on %s stays incomplete", (_, fake) => {
  const f = setup(fake);
  const coverage = collect(loadSettings(f.root), { reader: reader(f.fake, { code_scanning: () => ({ status: 403, message: "Advanced Security must be enabled" }) }) }).repositories[0]!.code_scanning.coverage;
  expect(coverage).toMatchObject({ status: "incomplete", count: null });
  expect(coverage.reason).not.toBe("not-free-on-private");
});

test("on another host a private admin 403 without either paid feature stays incomplete", () => {
  const f = setup({ visibility: "private", analysis_null: true, hostname: "ghe.example.com" }, { host: "ghe.example.com", settings: { hostname: "ghe.example.com", repository: "example/project", security_settings: "apply" } });
  const config = loadSettings(f.root);
  expect(config.hostname).toBe("ghe.example.com");
  const coverage = collect(config, { reader: reader(f.fake, { code_scanning: () => ({ status: 403, message: "Advanced Security must be enabled" }) }) }).repositories[0]!.code_scanning.coverage;
  expect(coverage).toMatchObject({ status: "incomplete", count: null });
  expect(coverage.reason).not.toBe("not-free-on-private");
});

function reconcile(f: Project, inventory: Inventory, handoff: boolean) {
  const id = recordRun(f.root, { authorized_sweep: true }), now = new Date().toISOString();
  const inventoryPath = save(f, `inventory-${id}.json`, inventory);
  const packet = { schema_version: 1, synthetic_input: false, inventory: { path: `inventory-${id}.json`, sha256: digest(readFileSync(inventoryPath)) },
    analysis: { evaluated_at: now, collection_revision: 1, policy_assessment: { reviewer: "operator", reference: "local:policy-check", assessed_at: now }, decisions: [], evidence: [], groups: [],
      coverage_handoffs: handoff ? [{ repository: "example/project", surface: "dependabot",
        handoff: { reference: id, owner: null, assignment_handoff: "next maintenance sweep", next_action: "collect the Dependabot surface again" } }] : [] },
    scanner_packets: [], history: [], evidence_files: [] };
  const packetPath = save(f, `packet-${id}.json`, packet);
  return main(["security-reconcile", "--repo", f.root, "--run-id", id, "--input", packetPath]).then(result => verifySecurityResult(loadSettings(f.root), id, result).revision.snapshot);
}

test.each([
  ["three alerts that appear once alerts are on", {}, (fake: FakeState) => fake.alerts ? three : { status: 403, message: "Dependabot alerts are disabled for this repository." }, 3, "enabled"],
  ["an empty list on the first read after the write", {}, () => [], 0, "enabled"],
  ["a write that does not read back, then one of three alerts", { noop: ["PUT vulnerability-alerts"] }, () => [alert(2)], 1, "not-changed"],
] as const)("apply then collect with %s keeps the alerts read, marks the surface alerts-enabled-this-run, and reconcile tracks it only with the handoff", async (_, fake, dependabot, count, state) => {
  const f = setup({ ...fake }), id = recordRun(f.root, { authorized_sweep: true });
  const { output: result } = f.helper("apply", { run_id: id });
  expect(result.entries.find(item => item.setting === "dependabot_alerts")).toMatchObject({ state, ...(state === "not-changed" ? { reason: "api-error" } : {}) });
  const file = save(f, "project.json", result);
  const inventory = collect(loadSettings(f.root), { reader: reader(f.fake, { dependabot }), run_id: id, security_settings: [file], applied_repositories: ["example/project"] } as never);
  const surface = inventory.repositories[0]!.dependabot;
  expect(surface.alerts).toHaveLength(count);
  expect(surface.coverage).toMatchObject({ status: "incomplete", reason: "alerts-enabled-this-run", count: null });
  const gap = "coverage handoff pending: example/project/dependabot";
  expect((await reconcile(f, inventory, false)).gaps).toContain(gap);
  expect((await reconcile(f, inventory, true)).gaps).not.toContain(gap);
});

test("apply then collect with alerts already on keeps a successful read complete", () => {
  const f = setup({ alerts: true }), id = recordRun(f.root, { authorized_sweep: true });
  const { output: result } = f.helper("apply", { run_id: id });
  expect(result.entries.find(item => item.setting === "dependabot_alerts")).toMatchObject({ state: "already-on" });
  const inventory = collect(loadSettings(f.root), { reader: reader(f.fake, { dependabot: () => three }), run_id: id, security_settings: [save(f, "project.json", result)], applied_repositories: ["example/project"] } as never);
  expect(inventory.repositories[0]!.dependabot.coverage).toMatchObject({ status: "complete", count: 3 });
});

test("a file for the second repository only still covers both repositories", () => {
  const f = setup({}, { settings: scoped(["example/second"]) }), id = recordRun(f.root, { authorized_sweep: true });
  const inventory = collect(loadSettings(f.root), { reader: reader(f.fake, { dependabot: () => three }), run_id: id, security_settings: [save(f, "second.json", enabled("example/second", id))] } as never);
  expect(inventory.repositories.map(row => row.repository).sort()).toEqual(["example/project", "example/second"]);
  expect(inventory.repositories.find(row => row.repository === "example/second")!.dependabot.coverage).toMatchObject({ status: "incomplete", reason: "alerts-enabled-this-run", count: null });
  expect(inventory.repositories.find(row => row.repository === "example/project")!.dependabot.coverage).toMatchObject({ status: "complete", count: 3 });
});

const badFiles: [string, (f: Project, id: string) => string[], string][] = [
  ["malformed JSON", f => [save(f, "bad.json", "{ not json")], "not valid helper JSON"],
  ["an out-of-scope repository", (f, id) => [save(f, "bad.json", enabled("other/elsewhere", id))], "outside the sweep's scope"],
  ["a second file for the same repository", (f, id) => [save(f, "one.json", enabled("example/project", id)), save(f, "two.json", enabled("example/project", id))], "more than one helper file"],
  ["another run ID", f => [save(f, "bad.json", enabled("example/project", "00000000-0000-4000-8000-000000000000"))], "another run ID"],
  ...([
    ["a numeric Renovate evidence", { detection: { renovate: { status: "present", evidence: 26 }, dependabot: { status: "not-checked" } } }],
    ["an unknown detection status", { detection: { renovate: { status: "maybe" }, dependabot: { status: "not-checked" } } }],
    ["an extra detection key", { detection: { renovate: { status: "none", note: "x" }, dependabot: { status: "not-checked" } } }],
    ["a numeric mode detail", { mode_detail: 7 }],
  ] as const).map(([name, change]): [string, (f: Project, id: string) => string[], string] =>
    [name, (f, id) => [save(f, "bad.json", { ...enabled("example/project", id), ...change })], "not valid helper JSON"]),
];
test.each(badFiles)("a helper file with %s changes no surface and shows as helper did not run in the report", (_, files, reason) => {
  const f = setup(), id = recordRun(f.root, { authorized_sweep: true }), config = loadSettings(f.root), paths = files(f, id);
  const inventory = collect(config, { reader: reader(f.fake, { dependabot: () => three }), run_id: id, security_settings: paths } as never);
  expect(inventory.repositories[0]!.dependabot.coverage).toMatchObject({ status: "complete", count: 3 });
  const text = renderReport(config, readRun(config, id), inventory, { security_settings: paths } as never);
  expect(section(text)).toContain("helper did not run");
  expect(section(text)).toContain(reason);
  expect(subsection(text, "example/project")).toContain("helper did not run");
});

test("an applied repository without an accepted helper file gets helper-receipt-missing", () => {
  const f = setup(), id = recordRun(f.root, { authorized_sweep: true });
  const surface = collect(loadSettings(f.root), { reader: reader(f.fake, { dependabot: () => three }), run_id: id, security_settings: [], applied_repositories: ["example/project"] } as never).repositories[0]!.dependabot;
  expect(surface.alerts).toHaveLength(3);
  expect(surface.coverage).toMatchObject({ status: "incomplete", reason: "helper-receipt-missing", count: null });
});

function four() {
  const f = setup({}, { settings: scoped(satellites) }), id = recordRun(f.root, { authorized_sweep: true }), config = loadSettings(f.root);
  return { f, id, config, run: readRun(config, id), inventory: collect(config, { reader: reader(f.fake) }) };
}
const decisions = (id: string, last: "check" | "apply" = "check") => [
  output("example/project", id, "apply", [{ setting: "dependabot_alerts", state: "already-on" }, { setting: "dependabot_security_updates", state: "left-off", reason: "renovate-overlap", detail: "renovate.json" }]),
  output("example/second", id, "apply", [{ setting: "secret_scanning_push_protection", state: "already-on", reason: "owner-choice-conflict" }]),
  output("example/third", id, last, [{ setting: "dependabot_security_updates", state: "already-on", reason: "paused" }, { setting: "secret_scanning", state: "not-changed", reason: "check-only" }]),
];

test("the report section follows Security alerts, mirrors each file, names the missing repository and lists exactly the owner decisions", () => {
  const { f, id, config, run, inventory } = four(), outputs = decisions(id);
  const paths = outputs.map((item, index) => save(f, `settings-${index}.json`, item));
  const text = renderReport(config, run, inventory, { security_settings: paths } as never);
  const headings = text.split("\n").filter(line => line.startsWith("## "));
  expect(headings[headings.indexOf("## Security alerts") + 1]).toBe("## Repository security settings");
  for (const item of outputs) {
    const table = subsection(text, item.repository).split("\n").filter(line => line.startsWith("| `"));
    expect(table).toEqual(item.entries.map(entry => expect.stringContaining(`| \`${entry.setting}\` | \`${entry.state}\` |`)));
  }
  expect(subsection(text, "example/fourth")).toContain("helper did not run");
  const owner = section(text).split("Owner decisions:")[1]!.split("\n").filter(line => line.startsWith("- "));
  expect(owner).toHaveLength(3);
  expect(owner.join("\n")).toContain("renovate-overlap");
  expect(owner.join("\n")).toContain("owner-choice-conflict");
  expect(owner.join("\n")).toContain("paused");
  expect(section(text)).toContain("`security_settings: apply`");
  expect(parseObservation(text).observations).toHaveLength(8);
});

test("a report without helper files has the section with a helper did not run row for every repository and names the opt-in", () => {
  const { config, run, inventory } = four(), text = renderReport(config, run, inventory);
  for (const repository of ["example/project", ...satellites]) expect(subsection(text, repository)).toContain("helper did not run");
  expect(section(text)).toContain("`security_settings: apply`");
});

test("the opt-in line counts only accepted files and their modes", () => {
  const { f, id, config, run, inventory } = four();
  const applied = decisions(id, "apply").map((item, index) => save(f, `apply-${index}.json`, item));
  expect(section(renderReport(config, run, inventory, { security_settings: applied } as never))).not.toContain("`security_settings: apply`");
  const stale = save(f, "stale.json", output("example/fourth", "00000000-0000-4000-8000-000000000000", "check", []));
  const mixed = renderReport(config, run, inventory, { security_settings: [...applied, stale] } as never);
  expect(section(mixed)).not.toContain("`security_settings: apply`");
  expect(subsection(mixed, "example/fourth")).toContain("another run ID");
  const rejected = ["example/project", "example/second"].map(repository => save(f, `rejected-${repository.split("/")[1]}.json`, enabled(repository, "00000000-0000-4000-8000-000000000000")));
  expect(section(renderReport(config, run, inventory, { security_settings: rejected } as never))).toContain("`security_settings: apply`");
});

/** A `gh` stand-in for the CLI that answers fixed GETs with `--include` headers. */
function ghShim(f: Project, responses: Record<string, unknown>) {
  const bin = join(f.root, ".tools/bin"), data = save(f, "responses.json", responses);
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env bun
import { readFileSync } from "node:fs";
const target = process.argv.at(-1), route = new URL(target.startsWith("https:") ? target : "https://api.github.com/" + target).pathname.slice(1);
const all = JSON.parse(readFileSync(${JSON.stringify(data)}, "utf8")), value = all[route];
const status = value === undefined ? 404 : 200, body = value === undefined ? { message: "Not Found" } : value;
process.stdout.write("HTTP/2.0 " + status + " Response\\r\\n\\r\\n" + JSON.stringify(body));
process.exit(status >= 400 ? 1 : 0);
`, { mode: 0o755 });
  return { ...process.env, PATH: bin + delimiter + process.env.PATH };
}

test("collect and report take repeated --security-settings and --applied-repository flags and never fail on a bad file", async () => {
  const f = setup({}, { settings: scoped(["example/second"]) }), id = recordRun(f.root, { authorized_sweep: true });
  const responses: Record<string, unknown> = {};
  for (const [repository, number] of [["example/project", 42], ["example/second", 7]] as const) {
    Object.assign(responses, { [`repos/${repository}`]: { id: number, full_name: repository, default_branch: "main", visibility: "public", private: false, permissions: { admin: true }, security_and_analysis: null },
      [`repos/${repository}/pulls`]: [], [`repos/${repository}/dependabot/alerts`]: three, [`repos/${repository}/code-scanning/alerts`]: [] });
  }
  const env = ghShim(f, responses);
  const files = [save(f, "project.json", enabled("example/project", id)), save(f, "second.json", enabled("example/second", id)), save(f, "bad.json", "{ not json")];
  const flags = files.flatMap(path => ["--security-settings", path]);
  const run = Bun.spawnSync(["bun", cliPath, "collect", "--repo", f.root, "--run-id", id, ...flags, "--applied-repository", "example/project", "--applied-repository", "example/second"], { env, stdout: "pipe", stderr: "pipe" });
  expect(run.stderr.toString()).toBe("");
  expect(run.exitCode).toBe(0);
  const inventory = JSON.parse(run.stdout.toString()) as Inventory;
  for (const row of inventory.repositories) expect(row.dependabot.coverage).toMatchObject({ status: "incomplete", reason: "alerts-enabled-this-run", count: null });
  const inventoryPath = save(f, "inventory.json", inventory), request = save(f, "request.json", { authorized_sweep: true, read_only: true });
  const report = await main(["report", "--repo", f.root, "--run-id", id, "--inventory", inventoryPath, "--default-commit", f.commit, "--default-branch", "main", "--request", request, ...flags]) as { text?: string; path?: string };
  const text = report.text ?? readFileSync(report.path!, "utf8");
  expect(subsection(text, "example/project")).toContain("| `dependabot_alerts` | `enabled` |");
  expect(subsection(text, "example/second")).toContain("| `dependabot_alerts` | `enabled` |");
  expect(section(text)).toContain("not valid helper JSON");
});
