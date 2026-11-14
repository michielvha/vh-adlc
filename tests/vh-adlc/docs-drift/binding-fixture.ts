/** Synthetic source/candidate/runtime setup shared by binding and normal controller tests. */
import { expect } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { WorkerCollectionOptions } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-worker";
import { readCoordinatedSelection } from "../../../plugins/vh-adlc/scripts/docs-drift/coordination";
import { verifyCandidate } from "../../../plugins/vh-adlc/scripts/docs-drift/candidate-verification";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { nativeReader, runtimeFixture } from "./runtime-fixture";
import { commitAll, git, put } from "./repository-fixture";

export async function bindingFixture(roots: string[], incompleteInventory: boolean, options: {
  scannerCase?: "none" | "finding"; sourceGuide?: string; coordinated?: boolean; sourceInsideCandidate?: boolean; sourceCheckNeedsRepair?: boolean; mutableInventory?: boolean; fullComponent?: boolean; legacy_ids?: number[]; role?: Parameters<typeof runtimeFixture>[3];
  prepareSource?: (fixture: Awaited<ReturnType<typeof runtimeFixture>>) => string;
  beforeCandidate?: (input: { repo: string; source: string; artifacts: string; baseline: Awaited<ReturnType<typeof verifyCandidate>>; selection: unknown; decisions: Uint8Array; worker_options: WorkerCollectionOptions }) => void | Promise<void>;
} = {}) {
  const { sourceInsideCandidate = false, sourceCheckNeedsRepair = false, beforeCandidate } = options;
  const f = await runtimeFixture(roots, true, false, options.role, options.fullComponent ?? false, options.legacy_ids), repo = f.repo;
  const scanner = readFileSync(join(import.meta.dir, "fixtures/scanner.js"), "utf8")
    .replace("__FIXTURE_CASE__", JSON.stringify(options.scannerCase ?? "none")).replace("__FIXTURE_ENDPOINT__", JSON.stringify("http://127.0.0.1:1"));
  put(repo, "scripts/scan.js", scanner); put(repo, "docs/suppressions.yaml", "suppressions: []\n");
  put(repo, "tests/docs/fixture.test.ts", sourceCheckNeedsRepair
    ? `import { expect, test } from "bun:test";\ntest("guide repaired", () => expect(require("node:fs").readFileSync("docs/guide.md", "utf8")).toBe("# Current candidate guide\\n"));\n`
    : `import { expect, test } from "bun:test";\ntest("guide exists", () => expect(require("node:fs").existsSync("docs/guide.md")).toBe(true));\n`);
  if (options.coordinated) {
    const template = readFileSync(join(import.meta.dir, "../../../internal/testrepo/testdata/docs/conforming.md"), "utf8");
    put(repo, "docs/internal/plans/active.md", template.replace("status: draft", "status: in-progress\nbranch: feat/other-writer")
      .replace("  - src/\n  - config.yml", "  - docs/guide.md"));
  }
  if (options.sourceGuide !== undefined) put(repo, "docs/guide.md", options.sourceGuide);
  const source = options.prepareSource?.(f) ?? commitAll(repo), candidate = join(f.root, "binding-candidate"), origin = join(f.root, "binding-origin"), artifacts = sourceInsideCandidate ? f.root : join(f.root, "binding-artifacts");
  if (!sourceInsideCandidate) mkdirSync(artifacts, { mode: 0o700 });
  git(f.root, "clone", "--no-local", "--no-checkout", repo, origin); git(origin, "update-ref", "refs/heads/main", source);
  let head = "";
  if (sourceInsideCandidate) {
    git(f.root, "clone", "--no-local", "--no-checkout", repo, candidate); git(candidate, "checkout", "--detach", source);
    put(candidate, "docs/guide.md", "# Current candidate guide\n"); head = commitAll(candidate);
  }
  const preimage = readFileSync(join(repo, "docs/guide.md")), replacement = Buffer.from("# Current candidate guide\n");
  const selection = { schema_version: 1 as const, source_commit: source, edits: [{ id: "guide-fix", path: "docs/guide.md", action: "replace" as const, start: 0,
    end: preimage.length, before_sha256: sha256(preimage), replacement_base64: replacement.toString("base64"), after_mode: "100644" as const }] };
  const common = { artifact_root: artifacts, owner: "fixture-owner", run: "fixture-run" };
  const sourceArtifacts = sourceInsideCandidate ? join(candidate, "baseline-proof") : artifacts;
  if (sourceInsideCandidate) chmodSync(candidate, 0o700);
  if (sourceInsideCandidate) mkdirSync(sourceArtifacts, { mode: 0o700 });
  const baseline = await verifyCandidate({ ...common, artifact_root: sourceArtifacts, repo, source, candidate_repo: repo, candidate: source,
    selection: { schema_version: 1, source_commit: source, edits: [] } });
  if (sourceInsideCandidate) {
    if (!baseline.scan_artifacts || !baseline.evidence || !baseline.record_path) throw Error("missing baseline proof fixture");
    const references = [...Object.values(baseline.scan_artifacts), ...baseline.commands.flatMap(command => [command.start, command.stdout, command.stderr, command.completion])];
    for (const ref of references) if (ref) ref.path = relative(artifacts, join(sourceArtifacts, ref.path));
    const { evidence: _evidence, ...payload } = baseline, bytes = canonicalJSON(payload);
    writeFileSync(baseline.record_path, bytes, { mode: 0o600 });
    baseline.evidence = { path: relative(artifacts, baseline.record_path), sha256: sha256(bytes) };
  }
  let coordination: { path: string; sha256: string } | undefined;
  if (options.coordinated) {
    const request = Buffer.from("Synthetic current owner coordinates exactly this ordinary guide edit with the active writer.\n");
    writeFileSync(join(artifacts, "coordination-owner.txt"), request, { mode: 0o600 });
    const bytes = canonicalJSON({ schema_version: 1, kind: "docs-drift-coordinated-selection", repository: "fixture/docs", source_commit: source,
      selection_sha256: sha256(canonicalJSON(selection)), overlaps: [{ kind: "feature", owner: "docs/internal/plans/active.md", document: "docs/guide.md" }],
      origin: { kind: "owner-current-request", artifact: { path: "coordination-owner.txt", sha256: sha256(request) } } });
    writeFileSync(join(artifacts, "coordination.json"), bytes, { mode: 0o600 }); coordination = { path: "coordination.json", sha256: sha256(bytes) };
  }
  const decisions = { schema_version: 1, kind: "docs-drift-decisions", mode: "advisory", source_commit: source,
    ...(coordination ? { coordination } : {}), selected_proposals: [], decisions: [{ id: "guide-fix", reason: "Synthetic source-based candidate" }], attention: [] };
  const decisionBytes = canonicalJSON(decisions); writeFileSync(join(artifacts, "decisions.json"), decisionBytes, { mode: 0o600 });
  const inventoryFile = join(f.root, "binding-native-inventory.json");
  if (options.mutableInventory) writeFileSync(inventoryFile, "[]", { mode: 0o600 });
  const native = nativeReader({ ...f, candidate: source, inventory_path: options.mutableInventory ? inventoryFile : undefined }, "fixture-bot", false, incompleteInventory), executable = Bun.which("git");
  if (!executable) throw Error("fixture requires Git");
  writeFileSync(join(f.root, "native-bin", "git"), `#!${process.execPath}
const args = process.argv.slice(2), target = args.indexOf("https://github.com/fixture/docs.git");
if (args.includes("push")) process.exit(91);
if (args.includes("fetch") && args.some(value => value.startsWith("https://")) && target < 0) process.exit(91);
if (target >= 0) { args[target] = ${JSON.stringify(origin)}; args.splice(args.indexOf("fetch"), 0, "-c", "protocol.file.allow=always"); }
const result = Bun.spawnSync([${JSON.stringify(executable)}, ...args], { stdout: "inherit", stderr: "inherit" }); process.exit(result.exitCode);
`, { mode: 0o700 });
  const worker_options: WorkerCollectionOptions = { ...common, repo, source, source_verification: baseline.evidence!,
    decisions: { path: "decisions.json", sha256: sha256(decisionBytes) }, credential: "synthetic-read-token", path: native.environment.PATH,
    cache_directory: f.selection.cache_directory, entry: "copilot", launcher_path: f.selection.launcher_path, settings_path: join(repo, ".vh-adlc/docs-drift.yaml") };
  await beforeCandidate?.({ repo, source, artifacts, baseline, selection, decisions: decisionBytes, worker_options });
  if (!sourceInsideCandidate) {
    git(f.root, "clone", "--no-local", "--no-checkout", repo, candidate); git(candidate, "checkout", "--detach", source);
    put(candidate, "docs/guide.md", replacement.toString()); head = commitAll(candidate);
  }
  const verified = await verifyCandidate({ ...common, repo, source, candidate_repo: candidate, candidate: head, selection,
    protection_context: { coordinated: readCoordinatedSelection({ repo, source, artifact_root: artifacts, candidate_repo: candidate, selection, reference: coordination }) } });
  const { assessSource } = await import("../../../plugins/vh-adlc/scripts/docs-drift/source-assessment");
  const assessment = sourceCheckNeedsRepair ? await assessSource({ ...common, repo, source }) : null;
  expect(baseline.complete, JSON.stringify({ stage: "source", diagnostics: baseline.diagnostics, scan: baseline.scan?.process })).toBe(!sourceCheckNeedsRepair);
  expect(verified.complete, JSON.stringify({ stage: "candidate", diagnostics: verified.diagnostics, scan: verified.scan?.process,
    commands: verified.commands.map(command => ({ argv: command.argv, process: command.process })) })).toBe(true);
  return { ...f, ...common, repo, source, candidate, origin, head, artifacts, selection, baseline, assessment, verified, decisions, native, inventoryFile,
    options: { ...common, repo, source, candidate_repo: candidate, candidate: head, selection,
      source_verification: assessment?.evidence ?? baseline.evidence!, candidate_verification: verified.evidence!, decisions: { path: "decisions.json", sha256: sha256(decisionBytes) },
      credential: "synthetic-read-token", path: native.environment.PATH, cache_directory: f.selection.cache_directory,
      entry: "copilot" as const, launcher_path: f.selection.launcher_path, settings_path: join(repo, ".vh-adlc/docs-drift.yaml") } };
}
