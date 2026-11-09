import { afterAll, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import type { CLIReport } from "../../../plugins/vh-adlc/scripts/docs-drift/cli";
import { populateRepository, put } from "./repository-fixture";
import { source, pin, write, commit, portableRecord, deliverRecord } from "./adoption-fixture";
import { trialDefinitionFixture } from "./trial-definition-fixture";
import { runtimeFixture } from "./runtime-fixture";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
const entry = join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/cli.ts");
function fixture(fault = "none") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-cli-"))); roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts");
  mkdirSync(repo, { mode: 0o700 }); mkdirSync(artifacts, { mode: 0o700 });
  const scanner = readFileSync(join(import.meta.dir, "fixtures/scanner.js"), "utf8")
    .replace("__FIXTURE_CASE__", JSON.stringify(fault)).replace("__FIXTURE_ENDPOINT__", JSON.stringify("http://127.0.0.1:1"));
  return { ...populateRepository(repo, false, scanner), root, artifacts };
}
function invoke(argv: string[], environment = process.env) {
  const result = Bun.spawnSync([process.execPath, entry, ...argv], { env: environment, stdout: "pipe", stderr: "pipe", timeout: 30000 });
  return { result, report: JSON.parse(result.stdout.toString()) as CLIReport };
}

function nativeReader(f: { root: string; candidate: string }, actor = "fixture-bot", errors = false, incompleteInventory = false) {
  const bin = join(f.root, "native-bin"), trace = join(f.root, "native-reads.jsonl");
  mkdirSync(bin, { mode: 0o700 });
  writeFileSync(join(bin, "gh"), `#!${process.execPath}
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2), endpoint = args.find(value => value.startsWith("repos/"));
appendFileSync(${JSON.stringify(trace)}, JSON.stringify({ args, provider: process.env.COPILOT_GITHUB_TOKEN ?? null,
  credential: process.env.GH_TOKEN === "synthetic-read-token", enterprise: process.env.GH_ENTERPRISE_TOKEN === "synthetic-read-token" }) + "\\n");
if (args.includes("graphql")) {
  console.log(JSON.stringify({ data: { viewer: { login: ${JSON.stringify(actor)}, databaseId: 20 } },
    ...(${errors} ? { errors: [{ message: "Synthetic incomplete viewer" }] } : {}) }));
} else {
  if (args[args.indexOf("--method") + 1] !== "GET") process.exit(91);
  const sha = ${JSON.stringify(f.candidate)};
  const value = endpoint === "repos/fixture/docs" ? { id: 10, full_name: "fixture/docs", default_branch: "main" }
    : endpoint === "repos/fixture/docs/git/ref/heads/main" ? { ref: "refs/heads/main", object: { type: "commit", sha } }
    : endpoint === "repos/fixture/docs/git/commits/" + sha ? { sha, tree: { sha: "a".repeat(40) }, parents: [], message: "Synthetic source" }
    : endpoint === "repos/fixture/docs/pulls?state=open&base=main&per_page=100&page=1" ? (${incompleteInventory} ? { message: "Synthetic missing inventory" } : [])
    : null;
  if (!value) process.exit(92);
  console.log("HTTP/2.0 200 OK\\r\\n\\r\\n" + JSON.stringify(value));
}
`, { mode: 0o700 });
  return { trace, environment: { ...process.env, PATH: bin + ":" + process.env.PATH,
    GH_TOKEN: "synthetic-read-token", COPILOT_GITHUB_TOKEN: "synthetic-provider-canary" } };
}

test("normal signal checks report an unselected staged runtime without changing caller state", () => {
  const f = source(roots);
  write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...f.configured, publication: { ...f.configured.publication, mode: "staged" } }));
  const selected = commit(f.repo, "synthetic staged CLI source");
  write(f.repo, ".vh-adlc/docs-drift.yaml", "Unrelated dirty policy\n");
  const before = captureRepositoryState(f.repo);
  const { result, report } = invoke(["check-upgrade-signals", "--repo", f.repo, "--source", selected]);
  expect(result.exitCode).toBe(0);
  expect(report.command).toBe("check-upgrade-signals");
  expect(report.signals).toMatchObject({ status: "staged-no-target", matches: null });
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["complete", "incomplete"])("normal proposal collection preserves native inventory %s", scenario => {
  const incomplete = scenario === "incomplete";
  const f = source(roots), native = nativeReader(f, "fixture-bot", false, incomplete), before = captureRepositoryState(f.repo);
  const { result, report } = invoke(["collect-proposals", "--repo", f.repo, "--source", f.candidate], native.environment);
  expect(result.exitCode).toBe(incomplete ? 2 : 0);
  expect(report.proposals).toMatchObject({ complete: !incomplete, proposals: [] });
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(readFileSync(native.trace, "utf8")).not.toContain("synthetic-provider-canary");
});

test.each(["match", "mismatch"])("normal signal checks distinguish candidate metadata %s", scenario => {
  const mismatch = scenario === "mismatch";
  const f = trialDefinitionFixture(roots), component = pin(), client = f.candidate_settings.clients["copilot-linux"];
  write(f.repo, ".vh-adlc/docs-drift-upgrade-signal.yaml", canonicalJSON({ schema_version: 1,
    source_repository: component.source_repository, source_commit: mismatch ? "b".repeat(40) : component.source_commit,
    source_release: component.source_release }));
  write(f.repo, ".vh-adlc/docs-drift-client-upgrade-signals.yaml", canonicalJSON({ schema_version: 1,
    clients: { "copilot-linux": { provider: client.provider, package: "@github/copilot", version: client.version, platform: client.platform } } }));
  const selected = commit(f.repo, "synthetic CLI signal proposal"), before = captureRepositoryState(f.repo);
  const { result, report } = invoke(["check-upgrade-signals", "--repo", f.repo, "--source", selected]);
  expect(result.exitCode).toBe(mismatch ? 1 : 0);
  expect(report.outcome).toBe(mismatch ? "attention" : "collected");
  expect(report.signals).toMatchObject({ matches: !mismatch, target: "candidate-trial" });
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test("normal trial-binding reports expose committed candidate policy without execution authority", () => {
  const f = trialDefinitionFixture(roots), before = captureRepositoryState(f.repo);
  const { result, report } = invoke(["trial-bindings", "--repo", f.repo, "--source", f.staged]);
  expect(result.exitCode).toBe(0);
  expect(report.command).toBe("trial-bindings");
  expect(report.trial).toMatchObject({ authority: "none", source_commit: f.staged,
    prospective_protected_sha256: f.definition.prospective_protected_sha256 });
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["without-token", "different-actor", "partial-viewer"])("normal adopted signal consistency remains credential-free %s", scenario => {
  const f = source(roots), component = pin(), client = f.configured.clients["copilot-linux"];
  write(f.repo, ".vh-adlc/docs-drift-upgrade-signal.yaml", canonicalJSON({ schema_version: 1,
    source_repository: component.source_repository, source_commit: component.source_commit, source_release: component.source_release }));
  write(f.repo, ".vh-adlc/docs-drift-client-upgrade-signals.yaml", canonicalJSON({ schema_version: 1,
    clients: { "copilot-linux": { provider: client.provider, package: "@github/copilot", version: client.version, platform: client.platform } } }));
  f.candidate = commit(f.repo, "synthetic CLI adopted signals");
  const selected = deliverRecord(f, portableRecord(f)), before = captureRepositoryState(f.repo);
  const native = nativeReader(f, scenario === "different-actor" ? "other-bot" : "fixture-bot", scenario === "partial-viewer");
  const { result, report } = invoke(["check-upgrade-signals", "--repo", f.repo, "--source", selected],
    { ...native.environment, GH_TOKEN: scenario === "without-token" ? "" : native.environment.GH_TOKEN });
  expect(result.exitCode).toBe(0);
  expect(report.outcome).toBe("collected");
  expect(existsSync(native.trace)).toBe(false);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["current", "stale"])("normal trial preparation requires the observed default %s", scenario => {
  const stale = scenario === "stale";
  const f = trialDefinitionFixture(roots), artifacts = join(f.root, "cli-trial-artifacts");
  mkdirSync(artifacts, { mode: 0o700 });
  const native = nativeReader({ ...f, candidate: stale ? f.candidate : f.staged });
  const before = captureRepositoryState(f.repo);
  const { result, report } = invoke(["prepare-trial-fixture", "--repo", f.repo, "--source", f.staged,
    "--artifact-root", artifacts], native.environment);
  expect(result.exitCode).toBe(stale ? 2 : 0);
  if (stale) {
    expect(report.diagnostics[0].message).toContain("current default");
    expect(readdirSync(artifacts)).toEqual([]);
  } else {
    expect(report.preparation).toMatchObject({ authority: "none", current_default: f.staged,
      fixture: { source_commit: f.definition.fixture.source_commit } });
    if (!report.preparation) throw Error("missing prepared fixture");
    expect(readFileSync(join(report.preparation.root, "preparation.json"), "utf8")).toBe(canonicalJSON(report.preparation).toString());
  }
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test("native preparation refuses a missing selected credential before invoking GitHub", () => {
  const f = trialDefinitionFixture(roots), native = nativeReader({ ...f, candidate: f.staged });
  const artifacts = join(f.root, "cli-empty-credential"); mkdirSync(artifacts, { mode: 0o700 });
  const { result, report } = invoke(["prepare-trial-fixture", "--repo", f.repo, "--source", f.staged, "--artifact-root", artifacts], {
    ...native.environment, GH_TOKEN: "", GH_ENTERPRISE_TOKEN: "synthetic-wrong-host-token",
  });
  expect(result.exitCode).toBe(2);
  expect(report.diagnostics[0].message).toContain("missing selected publication credential");
  expect(existsSync(native.trace)).toBe(false);
  expect(JSON.stringify(report)).not.toContain("synthetic-wrong-host-token");
});

test.each(["github.enterprise.invalid", "fixture.ghe.com"])("normal preparation uses the selected token for %s", hostname => {
  const f = trialDefinitionFixture(roots, { approved: { hostname } }), native = nativeReader({ ...f, candidate: f.staged });
  const artifacts = join(f.root, "cli-enterprise"); mkdirSync(artifacts, { mode: 0o700 });
  const environment = hostname.endsWith(".ghe.com") ? native.environment
    : { ...native.environment, GH_TOKEN: "synthetic-unselected-token", GH_ENTERPRISE_TOKEN: "synthetic-read-token" };
  const { result } = invoke(["prepare-trial-fixture", "--repo", f.repo, "--source", f.staged, "--artifact-root", artifacts], environment);
  expect(result.exitCode).toBe(0);
  const reads = readFileSync(native.trace, "utf8").trim().split("\n");
  for (const line of reads) expect(JSON.parse(line)).toMatchObject(hostname.endsWith(".ghe.com") ? { credential: true } : { enterprise: true });
});

test.each(["approved", "candidate"])("normal runtime inspection selects the retained %s", async scenario => {
  const candidate = scenario === "candidate";
  const f = await runtimeFixture(roots, true), selected = f.selection, native = nativeReader({ ...f, candidate: selected.current_default });
  const before = captureRepositoryState(f.repo);
  const args = ["inspect-runtime", "--repo", f.repo, "--source", selected.current_default,
    "--cache-root", selected.cache_directory, "--entry", selected.entry, "--launcher", selected.launcher_path,
    "--settings", candidate ? selected.settings_path : join(f.repo, ".vh-adlc/docs-drift.yaml"),
    ...(candidate ? ["--trial-definition", selected.definition_sha256] : [])];
  const { result, report } = invoke(args, native.environment);
  expect(result.exitCode).toBe(0);
  expect(report.runtime).toMatchObject({ kind: candidate ? "docs-drift-candidate-runtime" : "docs-drift-approved-runtime",
    current_default: selected.current_default, worker: { client: { version: candidate ? "fixture-2.0.0" : "fixture-1.0.0" } } });
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(readFileSync(join(f.approved.profile_directory, "session-marker"), "utf8")).toBe("Synthetic approved session\n");
});

test.each(["source", "definition", "settings", "launcher", "profile", "entry", "actor", "partial-viewer"] as const)("normal runtime inspection refuses stale or unavailable %s", async scenario => {
  const f = await runtimeFixture(roots), selected = f.selection;
  const native = nativeReader({ ...f, candidate: scenario === "source" ? f.candidate : selected.current_default },
    scenario === "actor" ? "other-bot" : "fixture-bot", scenario === "partial-viewer");
  if (scenario === "settings") writeFileSync(selected.settings_path, "Other candidate settings\n");
  if (scenario === "launcher") writeFileSync(selected.launcher_path, "Other launcher\n");
  if (scenario === "profile") rmSync(f.native.profile_directory, { recursive: true });
  const before = captureRepositoryState(f.repo);
  const { result, report } = invoke(["inspect-runtime", "--repo", f.repo, "--source", selected.current_default,
    "--cache-root", selected.cache_directory, "--entry", scenario === "entry" ? "unknown" : selected.entry,
    "--launcher", selected.launcher_path, "--settings", selected.settings_path,
    "--trial-definition", scenario === "definition" ? "0".repeat(64) : selected.definition_sha256], native.environment);
  expect(result.exitCode).toBe(2);
  const reason = { source: "observed current default", definition: "candidate trial definition changed",
    settings: "invoked entry bytes differ from committed policy", launcher: "invoked entry bytes differ from committed policy",
    profile: f.native.profile_directory, entry: "runtime inspection requires", actor: "current native trial identity",
    "partial-viewer": "native viewer query incomplete" }[scenario];
  expect(report.diagnostics[0].message).toContain(reason);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test("the normal CLI scans the selected committed source and preserves dirty caller work", () => {
  const f = fixture();
  put(f.repo, "src/app.ts", "Other work stays local\n"); put(f.repo, "untracked", "Another task\n");
  put(f.repo, ".vh-adlc/docs-drift.yaml", "uncommitted_host_override: true\n");
  const before = captureRepositoryState(f.repo);
  const { result, report } = invoke(["scan", "--repo", f.repo, "--source", f.commit, "--artifact-root", f.artifacts]);
  expect(result.exitCode).toBe(0);
  expect(report.command).toBe("scan");
  expect(report.outcome).toBe("collected");
  expect(report.source_commit).toBe(f.commit);
  expect(report.assessment?.complete).toBe(true);
  expect(report.assessment?.detectors).toHaveLength(2);
  expect(report.assessment?.checkout.startsWith(f.artifacts + "/")).toBe(true);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test("the normal CLI retains incomplete collection and valid finding neighbors", () => {
  const f = fixture("mixed-findings");
  const { result, report } = invoke(["scan", "--repo", f.repo, "--source", f.commit, "--artifact-root", f.artifacts]);
  expect(result.exitCode).toBe(2);
  expect(report.outcome).toBe("incomplete");
  expect(report.assessment?.complete).toBe(false);
  expect(report.assessment?.findings.map((item: { detector: string }) => item.detector)).toEqual(["valid-before", "valid-after"]);
});

test.each([
  ["scan"], ["scan", "--fixture", "yes"], ["scan", "--collector", "yes"], ["scan", "--repo", "x", "--repo", "y"],
  ["scan", "--repo", "x", "--source", "main", "--artifact-root", "x"], ["publish", "--approved", "true"],
  ["check-upgrade-signals", "--repo", "x", "--source", "main"], ["trial-bindings", "--fixture", "yes"],
  ["prepare-trial-fixture", "--repo", "x", "--source", "a".repeat(40)],
].map(argv => [argv]))("unknown, duplicate or unsafe CLI inputs return a structured refusal %j", argv => {
  const { result, report } = invoke(argv);
  expect(result.exitCode).toBe(2);
  expect(report.outcome).toBe("incomplete");
  expect(report.diagnostics.length).toBeGreaterThan(0);
});

test.each(["scan", "prepare-trial-fixture"].flatMap(command => ["caller", "shared", "symlink"].map(kind => [command, kind])))("command %s refuses artifact root %s", (command, kind) => {
  const f = fixture(), before = captureRepositoryState(f.repo), native = nativeReader({ ...f, candidate: f.commit });
  let artifacts = kind === "caller" ? f.repo : f.artifacts;
  if (kind === "shared") chmodSync(artifacts, 0o755);
  if (kind === "symlink") { artifacts = join(f.root, "artifact-alias"); symlinkSync(f.artifacts, artifacts); }
  const { result, report } = invoke([command, "--repo", f.repo, "--source", f.commit, "--artifact-root", artifacts], native.environment);
  expect(result.exitCode).toBe(2);
  expect(report.outcome).toBe("incomplete");
  expect(report.diagnostics[0].message).toContain(kind === "caller" ? "owned resource overlaps" : "private artifact directory required");
  expect(existsSync(native.trace)).toBe(false);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});


test("the normal scan entry keeps provider credentials out of the consumer scanner", () => {
  const f = fixture("environment");
  const { result, report } = invoke(["scan", "--repo", f.repo, "--source", f.commit, "--artifact-root", f.artifacts], {
    ...process.env, GH_TOKEN: "synthetic-cli-gh-canary", COPILOT_GITHUB_TOKEN: "synthetic-cli-provider-canary",
  });
  expect(result.exitCode).toBe(0);
  if (!report.assessment) throw Error("missing scan assessment");
  const probe = JSON.parse(readFileSync(report.assessment.output_path + ".environment.json", "utf8")) as { environment: Record<string, unknown> };
  expect(probe.environment.GH_TOKEN).toBeUndefined();
  expect(probe.environment.COPILOT_GITHUB_TOKEN).toBeUndefined();
  expect(result.stdout.toString()).not.toContain("synthetic-cli-gh-canary");
});
