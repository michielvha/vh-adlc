import { afterAll, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureRepositoryState } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import type { CLIReport } from "../../../plugins/vh-adlc/scripts/docs-drift/cli";
import { commitAll, git, populateRepository, put } from "./repository-fixture";
import { source, pin, write, commit, portableRecord, deliverRecord } from "./adoption-fixture";
import { trialDefinitionFixture } from "./trial-definition-fixture";
import { nativeReader, runtimeFixture } from "./runtime-fixture";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

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
  expect(readdirSync(f.artifacts)).toEqual([]);
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

test.each(["matching", "wrong-preimage"])("normal edit checks preserve caller work for %s", scenario => {
  const f = fixture(), replacement = Buffer.from("# Corrected guide\n");
  const packet = canonicalJSON({ schema_version: 1, source_commit: f.commit, edits: [{ id: "guide-fix", path: "docs/guide.md", action: "replace",
    start: 0, end: Buffer.byteLength("# Guide\n"), before_sha256: scenario === "matching" ? sha256(Buffer.from("# Guide\n")) : "0".repeat(64),
    replacement_base64: replacement.toString("base64"), after_mode: "100644" }] });
  writeFileSync(join(f.artifacts, "edits.json"), packet, { mode: 0o600 });
  put(f.repo, "docs/guide.md", "Other writer's uncommitted guide\n");
  const before = captureRepositoryState(f.repo);
  const { result, report } = invoke(["check-edits", "--repo", f.repo, "--source", f.commit, "--artifact-root", f.artifacts,
    "--selection", "edits.json", "--selection-sha256", sha256(packet)]);
  expect(result.exitCode).toBe(scenario === "matching" ? 0 : 2);
  expect(report.edit_inspection).toMatchObject({ authority: "none", complete: scenario === "matching" });
  if (scenario === "matching") expect(report.edit_inspection?.changes).toMatchObject([{ path: "docs/guide.md", after_sha256: sha256(replacement) }]);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test("normal preparation applies the selected edit in its owned uncommitted source", () => {
  const f = fixture(), replacement = Buffer.from("# Prepared guide\n");
  const packet = canonicalJSON({ schema_version: 1, source_commit: f.commit, edits: [{ id: "guide-fix", path: "docs/guide.md", action: "replace",
    start: 0, end: Buffer.byteLength("# Guide\n"), before_sha256: sha256(Buffer.from("# Guide\n")),
    replacement_base64: replacement.toString("base64"), after_mode: "100644" }] });
  writeFileSync(join(f.artifacts, "edits.json"), packet, { mode: 0o600 });
  put(f.repo, "docs/guide.md", "Other writer's draft\n");
  const before = captureRepositoryState(f.repo);
  const { result, report } = invoke(["prepare", "--repo", f.repo, "--source", f.commit, "--artifact-root", f.artifacts,
    "--selection", "edits.json", "--selection-sha256", sha256(packet)]);
  expect(result.exitCode).toBe(0);
  expect(report.prepared).toMatchObject({ state: "prepared-uncommitted", source_commit: f.commit });
  if (!report.prepared?.checkout) throw Error("missing owned preparation source");
  expect(report.prepared.checkout.startsWith(f.artifacts + "/")).toBe(true);
  expect(readFileSync(join(report.prepared.checkout, "docs/guide.md"))).toEqual(replacement);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test.each(["digest", "noncanonical", "source", "authority-field", "escape", "symlink", "different-head"])("normal edit checks refuse %s input", scenario => {
  const f = fixture(), selection = { schema_version: 1, source_commit: scenario === "source" ? "0".repeat(40) : f.commit, edits: [] };
  if (scenario === "authority-field") Object.assign(selection, { approved: true });
  const packet = scenario === "noncanonical" ? Buffer.from(JSON.stringify(selection, null, 2)) : canonicalJSON(selection);
  writeFileSync(join(f.artifacts, "edits.json"), packet, { mode: 0o600 });
  if (scenario === "symlink") symlinkSync("edits.json", join(f.artifacts, "alias.json"));
  if (scenario === "different-head") { put(f.repo, "docs/guide.md", "Another committed guide\n"); commitAll(f.repo); }
  const before = captureRepositoryState(f.repo);
  const { result, report } = invoke(["check-edits", "--repo", f.repo, "--source", f.commit, "--artifact-root", f.artifacts,
    "--selection", scenario === "escape" ? "../edits.json" : scenario === "symlink" ? "alias.json" : "edits.json",
    "--selection-sha256", scenario === "digest" ? "0".repeat(64) : sha256(packet)]);
  expect(result.exitCode).toBe(2);
  expect(report.outcome).toBe("incomplete");
  expect(report.diagnostics.length).toBeGreaterThan(0);
  if (scenario === "different-head") {
    expect(report.diagnostics.some(item => item.code === "assessment-source")).toBe(true);
    expect(new Set(report.diagnostics.map(item => item.message)).size).toBe(report.diagnostics.length);
  }
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
  ["collect-publication-inputs", "--trial-definition", "a".repeat(64)],
  ["bind-publication", "--trial-definition", "a".repeat(64)],
  ["collect-worker-inputs", "--trial-definition", "a".repeat(64)],
  ["collect-worker-inputs", "--candidate-repo", "future-candidate"],
  ["read-worker-preparation", "--trial-definition", "a".repeat(64)],
  ["read-worker-preparation", "--approved", "true"],
  ["collect-review-target", "--approved", "true"],
  ["read-candidate-review", "--collector", "true"],
  ["read-candidate-review", "--approved", "true"],
  ["check-publication", "--approved", "true"],
  ["publish", "--collector", "true"],
  ["resume", "--trial-definition", "a".repeat(64)],
  ["check-verification", "--repo", "x", "--source", "a".repeat(40), "--artifact-root", "x"],
].map(argv => [argv]))("unknown, duplicate or unsafe CLI inputs return a structured refusal %j", argv => {
  const { result, report } = invoke(argv);
  expect(result.exitCode).toBe(2);
  expect(report.outcome).toBe("incomplete");
  expect(report.diagnostics.length).toBeGreaterThan(0);
});

test.each(["scan", "assess-source", "collect-worker-inputs", "read-worker-preparation", "prepare-trial-fixture", "check-edits", "prepare", "collect-resolution", "collect-closure", "check-candidate", "collect-publication-inputs", "verify-candidate", "check-verification", "bind-publication", "collect-review-target", "read-candidate-review", "check-publication", "publish", "resume"].flatMap(command => ["caller", "shared", "symlink"].map(kind => [command, kind])))("command %s refuses artifact root %s", (command, kind) => {
  const f = fixture(), before = captureRepositoryState(f.repo), native = nativeReader({ ...f, candidate: f.commit });
  let artifacts = kind === "caller" ? f.repo : f.artifacts;
  if (kind === "shared") chmodSync(artifacts, 0o755);
  if (kind === "symlink") { artifacts = join(f.root, "artifact-alias"); symlinkSync(f.artifacts, artifacts); }
  const required = command === "check-verification" ? ["--verification", "proof.json", "--verification-sha256", "a".repeat(64)]
    : ["bind-publication", "collect-review-target", "read-candidate-review", "check-publication", "publish", "resume"].includes(command) ? ["--source-verification", "source.json", "--source-verification-sha256", "a".repeat(64),
      "--candidate-verification", "candidate.json", "--candidate-verification-sha256", "a".repeat(64), "--decisions", "decisions.json", "--decisions-sha256", "a".repeat(64)]
      : ["collect-worker-inputs", "read-worker-preparation"].includes(command) ? ["--source-verification", "source.json", "--source-verification-sha256", "a".repeat(64),
        "--decisions", "decisions.json", "--decisions-sha256", "a".repeat(64)] : [];
  if (["read-worker-preparation", "collect-review-target", "read-candidate-review", "check-publication", "publish", "resume"].includes(command)) required.push("--worker-capture", "capture.json", "--worker-capture-sha256", "a".repeat(64));
  if (["read-candidate-review", "check-publication", "publish", "resume"].includes(command)) required.push("--reviewer-capture", "reviewer.json", "--reviewer-capture-sha256", "a".repeat(64));
  if (["check-publication", "publish", "resume"].includes(command)) required.push("--authority", "request.json", "--authority-sha256", "a".repeat(64));
  if (command === "resume") required.push("--journal-directory", join(f.artifacts, "original-journal"));
  const { result, report } = invoke([command, "--repo", f.repo, "--source", f.commit, "--artifact-root", artifacts, ...required], native.environment);
  expect(result.exitCode).toBe(2);
  expect(report.outcome).toBe("incomplete");
  expect(report.diagnostics[0].message).toContain(kind === "caller" ? "owned resource overlaps" : "private artifact directory required");
  expect(existsSync(native.trace)).toBe(false);
  expect(readdirSync(f.artifacts)).toEqual([]);
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

test("normal preparation reports the original application error and retained resources after recording fails", () => {
  const f = fixture(), bin = join(f.root, "apply-failure-bin"), realGit = Bun.which("git");
  if (!realGit) throw Error("native fixture requires Git");
  mkdirSync(bin, { mode: 0o700 });
  writeFileSync(join(bin, "git"), `#!${process.execPath}
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
const args = process.argv.slice(2), child = Bun.spawnSync([${JSON.stringify(realGit)}, ...args], { stdout: "inherit", stderr: "inherit" });
if (child.exitCode === 0 && args.includes("apply") && !args.includes("--check")) {
  mkdirSync(join(dirname(process.cwd()), "prepare-result.json"), { mode: 0o700 }); process.exit(78);
}
process.exit(child.exitCode);
`, { mode: 0o700 });
  const packet = canonicalJSON({ schema_version: 1, source_commit: f.commit, edits: [{ id: "guide-fix", path: "docs/guide.md", action: "replace",
    start: 0, end: Buffer.byteLength("# Guide\n"), before_sha256: sha256(Buffer.from("# Guide\n")),
    replacement_base64: Buffer.from("# Prepared guide\n").toString("base64"), after_mode: "100644" }] });
  writeFileSync(join(f.artifacts, "edits.json"), packet, { mode: 0o600 });
  const before = captureRepositoryState(f.repo);
  const { result, report } = invoke(["prepare", "--repo", f.repo, "--source", f.commit, "--artifact-root", f.artifacts,
    "--selection", "edits.json", "--selection-sha256", sha256(packet)], { ...process.env, PATH: bin + ":" + process.env.PATH });
  expect(result.exitCode).toBe(2);
  expect(report.diagnostics.some(item => item.message === "preparation Git apply failed")).toBe(true);
  expect(report.retained_resources?.checkout?.startsWith(f.artifacts + "/")).toBe(true);
  if (!report.retained_resources?.checkout) throw Error("missing failed preparation source");
  expect(readFileSync(join(report.retained_resources.checkout, "docs/guide.md")).toString()).toBe("# Prepared guide\n");
  expect(captureRepositoryState(f.repo)).toEqual(before);
});


test.each(["matching", "disjoint-advance", "actor", "rollback", "malformed-policy", "changed-source", "settings", "cache", "cache-in-candidate", "credential", "caller-missing", "caller-symlink"])("normal publication input collection binds current production policy %s", async fault => {
  const f = await runtimeFixture(roots, true, fault === "disjoint-advance"), selected = f.selection;
  put(f.repo, "docs/suppressions.yaml", "suppressions: []\n");
  const source = commitAll(f.repo);
  const origin = join(f.root, "publication-origin"); git(f.root, "clone", "--no-local", "--no-checkout", f.repo, origin);
  git(origin, "checkout", "--detach", source);
  let remoteDefault = source;
  if (fault === "rollback" || fault === "malformed-policy") {
    const settings = JSON.parse(readFileSync(join(origin, ".vh-adlc/docs-drift.yaml"), "utf8"));
    settings.publication.mode = fault === "malformed-policy" ? "invalid-state" : "staged"; put(origin, ".vh-adlc/docs-drift.yaml", canonicalJSON(settings).toString());
    remoteDefault = commitAll(origin);
  }
  if (fault === "disjoint-advance") { put(origin, "outside.txt", "Unbound native default advance\n"); remoteDefault = commitAll(origin); }
  if (fault === "changed-source") { put(origin, "docs/later.md", "Later bound documentation\n"); remoteDefault = commitAll(origin); }
  git(origin, "update-ref", "refs/heads/main", remoteDefault);
  if (remoteDefault !== source) expect(() => git(f.repo, "cat-file", "-e", remoteDefault + "^{commit}")).toThrow();
  const artifacts = join(f.root, "publication-inputs"), candidate = join(f.root, "publication-candidate");
  mkdirSync(artifacts, { mode: 0o700 }); git(f.root, "clone", "--no-local", "--no-checkout", f.repo, candidate);
  git(candidate, "checkout", "--detach", source);
  if (remoteDefault !== source) expect(() => git(candidate, "cat-file", "-e", remoteDefault + "^{commit}")).toThrow();
  const beforeBytes = readFileSync(join(candidate, "docs/guide.md")), replacement = Buffer.from("# Selected candidate guide\n");
  put(candidate, "docs/guide.md", replacement.toString()); const head = commitAll(candidate);
  const packet = canonicalJSON({ schema_version: 1, source_commit: source, edits: [{ id: "guide-fix", path: "docs/guide.md", action: "replace",
    start: 0, end: beforeBytes.length, before_sha256: sha256(beforeBytes), replacement_base64: replacement.toString("base64"), after_mode: "100644" }] });
  writeFileSync(join(artifacts, "edits.json"), packet, { mode: 0o600 });
  const native = nativeReader({ ...f, candidate: remoteDefault }, fault === "actor" ? "other-bot" : "fixture-bot"), realGit = Bun.which("git");
  if (!realGit) throw Error("fixture requires Git");
  writeFileSync(join(f.root, "native-bin", "git"), `#!${process.execPath}
import { renameSync, symlinkSync } from "node:fs";
const args = process.argv.slice(2), target = args.indexOf("https://github.com/fixture/docs.git");
if (args.includes("fetch") && args.some(value => value.startsWith("https://")) && target < 0) process.exit(91);
if (target >= 0) { args[target] = ${JSON.stringify(origin)}; args.splice(args.indexOf("fetch"), 0, "-c", "protocol.file.allow=always"); }
const child = Bun.spawnSync([${JSON.stringify(realGit)}, ...args], { stdout: "inherit", stderr: "inherit" });
if (target >= 0 && child.exitCode === 0 && ["caller-missing", "caller-symlink"].includes(${JSON.stringify(fault)})) {
  renameSync(${JSON.stringify(candidate)}, ${JSON.stringify(join(f.root, "retained-candidate"))});
  if (${JSON.stringify(fault)} === "caller-symlink") symlinkSync(${JSON.stringify(join(f.root, "retained-candidate"))}, ${JSON.stringify(candidate)});
}
process.exit(child.exitCode);
`, { mode: 0o700 });
  if (fault === "settings") put(f.repo, ".vh-adlc/docs-drift.yaml", "Other caller draft\n");
  if (fault === "cache-in-candidate") chmodSync(candidate, 0o700);
  const before = captureRepositoryState(f.repo), candidateBefore = captureRepositoryState(candidate);
  const { result, report } = invoke(["collect-publication-inputs", "--repo", f.repo, "--source", source,
    "--candidate-repo", candidate, "--candidate", head, "--artifact-root", artifacts, "--selection", "edits.json", "--selection-sha256", sha256(packet),
    "--cache-root", fault === "cache" ? join(f.root, "missing-cache") : fault === "cache-in-candidate" ? candidate : selected.cache_directory, "--entry", "copilot",
    "--launcher", selected.launcher_path, "--settings", join(f.repo, ".vh-adlc/docs-drift.yaml")],
  { ...native.environment, GH_TOKEN: fault === "credential" ? "" : native.environment.GH_TOKEN });
  const success = ["matching", "disjoint-advance"].includes(fault);
  if (success) expect(report.diagnostics).toEqual([]);
  expect(result.exitCode).toBe(success ? 0 : 2);
  if (success) expect(report.publication_inputs).toMatchObject({ complete: true, authority: "none", current_default: remoteDefault,
    candidate: { complete: true, candidate_commit: head }, runtime: { kind: "docs-drift-approved-runtime" } });
  else {
    expect(report.publication_inputs?.complete).toBe(false);
    if (fault === "rollback" || fault === "malformed-policy") expect(report.publication_inputs?.scope_changed).toBe(true);
    const reasons: Record<string, string> = { actor: "Selected native publication actor", rollback: "not adopted", "malformed-policy": "publication mode", "changed-source": "needs fresh collection and review",
      settings: "invoked entry bytes differ from committed policy", cache: "missing-cache", "cache-in-candidate": "overlaps a caller checkout", credential: "missing selected publication credential",
      "caller-missing": "Caller changed or became unavailable", "caller-symlink": "Caller changed or became unavailable" };
    expect(report.diagnostics.map(item => item.message).join("\n")).toContain(reasons[fault]);
  }
  if (fault === "disjoint-advance") {
    const inputs = report.publication_inputs;
    if (!inputs?.freshness || !inputs.store) throw Error("missing collected disjoint source");
    expect(inputs.freshness.fresh).toBe(true);
    expect(inputs.freshness.changed_paths).toEqual(["outside.txt"]);
    expect(git(inputs.store.root, "rev-parse", remoteDefault + "^{commit}")).toBe(remoteDefault);
    expect(() => git(f.repo, "cat-file", "-e", remoteDefault + "^{commit}")).toThrow();
    expect(() => git(candidate, "cat-file", "-e", remoteDefault + "^{commit}")).toThrow();
  }
  expect(captureRepositoryState(f.repo)).toEqual(before);
  if (fault === "caller-missing" || fault === "caller-symlink") {
    expect(report.publication_inputs?.store?.root.startsWith(artifacts + "/")).toBe(true);
    expect(existsSync(report.publication_inputs?.store?.record_path ?? "")).toBe(true);
    expect(captureRepositoryState(join(f.root, "retained-candidate"))).toEqual(candidateBefore);
  } else expect(captureRepositoryState(candidate)).toEqual(candidateBefore);
}, 60000);
