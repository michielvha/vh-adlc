// Fixed operator worker. The model receives only its argument-free shell launcher.
import { cpSync, lstatSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkExecutable } from "./check-executable";
import { builderOrder } from "./builder-order";
import { createHash } from "node:crypto";
export function runPairedChecks(o: any) {
  const h = o.handoff, hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const gitBytes = (root: string, ...args: string[]) => {
    const result = Bun.spawnSync([o.git, "-C", root, ...args], { env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode) throw Error(result.stderr.toString()); return result.stdout;
  };
  const git = (root: string, ...args: string[]) => gitBytes(root, ...args).toString().trim();
  let owner_request: any = null;
  if (o.owner_request_path) {
    const raw = readFileSync(o.owner_request_path), info = lstatSync(o.owner_request_path), data = JSON.parse(raw.toString());
    if (!info.isFile() || info.isSymbolicLink() || hash(raw) !== o.owner_request_sha256 || !readFileSync(join(o.packet, "owner-request.json")).equals(raw) || data.source_repository !== h.source_repository || data.selected_bot_commit !== o.selected_bot_commit) throw Error("original trusted task input mismatch");
    owner_request = { pass: true, sha256: hash(raw), source_repository: data.source_repository, selected_bot_commit: data.selected_bot_commit };
  }
  let engineering: any = null;
  if (o.engineering_revision) {
    git(o.engineering_root, "rev-parse", "--verify", `${o.engineering_revision}^{commit}`);
    engineering = { revision: o.engineering_revision, verified_files: o.engineering_files.map((path: string) => {
      const raw = gitBytes(o.engineering_root, "show", `${o.engineering_revision}:${path}`);
      if (!readFileSync(join(o.packet, "engineering", path)).equals(raw)) throw Error("pinned engineering input changed");
      return { path, sha256: hash(raw) };
    }) };
  }
  const snapshot = () => ({ source: git(h.source_root, "rev-parse", "HEAD"), record: git(h.record_root, "rev-parse", "HEAD"), source_status: git(h.source_root, "status", "--porcelain=v1", "--untracked-files=all"), record_status: git(h.record_root, "status", "--porcelain=v1", "--untracked-files=all"), source_index: hash(readFileSync(o.sourceIndex)), record_index: hash(readFileSync(o.recordIndex)) });
  const executableBefore = checkExecutable(o.bun, h.source_root), before = snapshot();
  if (o.expected_executable && JSON.stringify(executableBefore) !== JSON.stringify(o.expected_executable)) throw Error("provided verification executable changed before checks");
  if (before.source !== h.source_target || before.record !== h.record_target || before.source_status || before.record_status) throw Error("exact committed clean paired targets required");
  const compareTree = (target: string, packet: string, checkWorktree: boolean, repository = h.source_root) => gitBytes(repository, "ls-tree", "-rz", target).toString().split("\0").filter(Boolean).map(row => {
    const parsed = row.match(/^(100644|100755) blob ([a-f0-9]+)\t(.+)$/s); if (!parsed) throw Error("regular committed check inputs required");
    const [, mode, blob, path] = parsed, bytes = gitBytes(repository, "show", `${target}:${path}`), expectedMode = mode === "100755" ? 0o755 : 0o644;
    for (const root of [packet, ...(checkWorktree ? [repository] : [])]) {
      const info = lstatSync(join(root, path)); if (!info.isFile() || info.isSymbolicLink() || ((info.mode & 0o100) !== 0) !== (expectedMode === 0o755) || !readFileSync(join(root, path)).equals(bytes)) throw Error(`Git blob/mode mismatch: ${target}:${path}`);
    }
    return { path, blob, mode, sha256: hash(bytes) };
  });
  const ancestor = Bun.spawnSync([o.git, "-C", h.source_root, "merge-base", "--is-ancestor", h.task_base, h.source_target], { stdout: "pipe", stderr: "pipe" });
  const task_base_parent = git(h.source_root, "rev-parse", `${h.task_base}^`), task_base_tree = git(h.source_root, "rev-parse", `${h.task_base}^{tree}`), selected_bot_tree = git(h.source_root, "rev-parse", `${o.selected_bot_commit}^{tree}`);
  const commit_paths = git(h.source_root, "log", "--format=", "--name-only", `${h.task_base}..${h.source_target}`).split("\n").filter(Boolean);
  if (ancestor.exitCode !== 0 || task_base_parent !== o.contract_base || task_base_tree !== selected_bot_tree || commit_paths.some(path => !h.affected_paths.includes(path))) throw Error("selected bot/task base/repair ancestry mismatch");
  const ancestry = { pass: true, task_base: h.task_base, task_base_parent, task_base_tree, selected_bot_commit: o.selected_bot_commit, selected_bot_tree, source_descends_from_task_base: true, commits: git(h.source_root, "rev-list", "--reverse", `${h.task_base}..${h.source_target}`).split("\n"), changed_paths: [...new Set(commit_paths)].sort() };
  if (git(h.source_root, "remote", "get-url", "origin") !== `https://github.com/${h.source_repository}.git` || git(h.record_root, "remote", "get-url", "origin") !== `https://github.com/${h.record_repository}.git`) throw Error("paired repository identity mismatch");
  const p = o.primary, preservation = { main_head: git(p.main, "rev-parse", "HEAD"), main_index: hash(readFileSync(git(p.main, "rev-parse", "--path-format=absolute", "--git-path", "index"))), invocation_head: git(p.invocation, "rev-parse", "HEAD"), invocation_index: hash(readFileSync(git(p.invocation, "rev-parse", "--path-format=absolute", "--git-path", "index"))), invocation_status: git(p.invocation, "status", "--porcelain=v1", "--untracked-files=all"), working: readFileSync(join(p.invocation, "src/app.ts"), "utf8"), staged: readFileSync(join(p.invocation, "unrelated-staged.txt"), "utf8"), untracked: readFileSync(join(p.invocation, "scratch.txt"), "utf8") };
  if (preservation.main_head !== p.initial.head || preservation.main_index !== p.initial.main_index || preservation.invocation_head !== p.initial.invocation_head || preservation.invocation_index !== p.initial.invocation_index || preservation.invocation_status !== p.initial.invocation_status || preservation.working !== "// Another writer's unrelated working bytes.\nexport const answer = 43;\n" || preservation.staged !== "keep the other writer's staged bytes\n" || preservation.untracked !== "keep unrelated untracked bytes\n") throw Error("unrelated owning/invocation state was not preserved");
  let related_source_preservation: any = null;
  if (o.related_source_owner) {
    const related = o.related_source_owner, observed = { head: git(related.root, "rev-parse", "HEAD"), index: hash(readFileSync(git(related.root, "rev-parse", "--path-format=absolute", "--git-path", "index"))), status: git(related.root, "status", "--porcelain=v1") };
    if (observed.head !== related.head || observed.index !== related.index || observed.status !== related.status) throw Error("canonical related source was not preserved");
    related_source_preservation = { pass: true, ...observed };
  }
  const primary_inputs = (o.primary_input_paths ?? []).map((path: string) => {
    const bytes = gitBytes(p.main, "show", `${p.initial.head}:${path}`), entry = git(p.main, "ls-tree", p.initial.head, "--", path), mode = entry.startsWith("100755 ") ? "100755" : entry.startsWith("100644 ") ? "100644" : null;
    if (!mode || !readFileSync(join(o.packet, "primary-inputs", path)).equals(bytes) || !readFileSync(join(p.main, path)).equals(bytes)) throw Error("primary ownership input correspondence failed");
    return { path, target: p.initial.head, mode, sha256: hash(bytes) };
  });
  const contract_inputs = compareTree(o.contract_base, join(o.packet, "contract-baseline"), false);
  const baseline_inputs = compareTree(h.task_base, join(o.packet, "baseline"), false), source_inputs = compareTree(h.source_target, join(o.packet, "source"), true);
  const recordBytes = gitBytes(h.record_root, "show", `${h.record_target}:${h.record_path}`), recordEntry = git(h.record_root, "ls-tree", h.record_target, "--", h.record_path), recordMode = recordEntry.startsWith("100755 ") ? 0o755 : recordEntry.startsWith("100644 ") ? 0o644 : null;
  if (!recordMode || ((lstatSync(join(h.record_root, h.record_path)).mode & 0o100) !== 0) !== (recordMode === 0o755) || !readFileSync(join(h.record_root, h.record_path)).equals(recordBytes) || !readFileSync(join(o.packet, "repair-record.md")).equals(recordBytes)) throw Error("committed Definition correspondence failed");
  const definitionSection = (bytes: Buffer) => bytes.toString().split("## Definition\n", 2)[1]?.split("\n## Evidence", 1)[0];
  const definition = definitionSection(recordBytes);
  if (!definition) throw Error("committed Definition section required");
  if (o.previous_record_target === h.record_target) throw Error("prior Definition comparison requires a distinct actual target");
  const priorDefinition = o.previous_record_target ? definitionSection(gitBytes(h.record_root, "show", `${o.previous_record_target}:${h.record_path}`)) : null;
  if (o.previous_record_target && definition !== priorDefinition) throw Error("append-only evidence changed the reviewed Definition");
  const definition_correspondence = { pass: true, sha256: hash(Buffer.from(definition)), prior_record_target: o.previous_record_target ?? null, prior_sha256: priorDefinition ? hash(Buffer.from(priorDefinition)) : null, byte_equal: priorDefinition ? true : null, section_convention: "Bytes after ## Definition newline and before newline ## Evidence; includes the original blank-line boundary. A null prior means an initial Definition, not a continuity comparison." };
  const prior_reviews = (o.prior_reviews ?? []).map((row: any) => {
    for (const file of row.files) {
      const raw = readFileSync(join(row.source, file.name));
      if (hash(raw) !== file.sha256 || !readFileSync(join(o.packet, row.directory, file.name)).equals(raw)) throw Error("prior actual review artifact changed");
    }
    const records = readFileSync(join(row.source, "records.txt"), "utf8"), returned = readFileSync(join(row.source, "returned.txt"), "utf8"), provenance = JSON.parse(readFileSync(join(row.source, "result.json"), "utf8"));
    const events = readFileSync(join(row.source, "native.jsonl"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    if (!recordBytes.toString().includes(records) || returned.split("\n").slice(1).join("\n").replace(/^\n+/, "") !== records || events.filter(event => event.type === "assistant.message" && event.data.content?.startsWith("MODEL: ")).at(-1)?.data.content !== returned) throw Error("prior review storage or native correspondence failed");
    return { directory: row.directory, records_sha256: hash(Buffer.from(records)), source_target: provenance.source_target, record_target: provenance.record_target, original_artifacts_equal: true, native_and_stored_records_equal: true };
  });
  const check = (cwd: string) => {
    const argv = [o.bun, "test", "tests"], result = Bun.spawnSync(argv, { cwd, stdout: "pipe", stderr: "pipe" });
    return { argv, cwd, exit_code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  };
  const contract_check = check(join(o.packet, "contract-baseline")), baseline_check = check(join(o.packet, "baseline")), source_check = check(h.source_root), scratch = mkdtempSync(join(o.output, "normalization-")); cpSync(join(o.packet, "source"), scratch, { recursive: true });
  const argv = [o.bun, "scripts/regenerate-lock.ts"], normalized = Bun.spawnSync(argv, { cwd: scratch, stdout: "pipe", stderr: "pipe" });
  const normalizer_check = { argv, cwd: scratch, exit_code: normalized.exitCode, stdout: normalized.stdout.toString(), stderr: normalized.stderr.toString(), pass: normalized.exitCode === 0 && readFileSync(join(scratch, "runtime-lock.json")).equals(gitBytes(h.source_root, "show", `${h.source_target}:runtime-lock.json`)) };
  let satellite: any = null;
  if (o.topology === "satellite") {
    const bump = h.primary_batch, pointer = "deps/builder.version.json";
    if (!bump || bump.bot_commit !== o.primary_bot_commit || bump.base !== p.initial.head || git(bump.root, "rev-parse", "HEAD") !== bump.target || git(p.main, "rev-parse", `${bump.target}^{tree}`) !== git(p.main, "rev-parse", `${o.primary_bot_commit}^{tree}`) || git(p.main, "diff", "--name-only", p.initial.head, bump.target) !== pointer) throw Error("selected primary pointer/source binding mismatch");
    if (!readFileSync(join(o.packet, "primary-batch", pointer)).equals(gitBytes(p.main, "show", `${bump.target}:${pointer}`)) || git(p.main, "ls-tree", "-r", "--name-only", bump.target, "--", h.record_path)) throw Error("primary source/evidence scope mismatch");
    if (!bump.builder_receipt.startsWith(o.builder_output_dir + "/") || !lstatSync(bump.builder_receipt).isFile() || lstatSync(bump.builder_receipt).isSymbolicLink()) throw Error("builder artifact is outside declared owned storage");
    const primary_batch_inputs = compareTree(bump.target, join(o.packet, "primary-batch"), true, bump.root);
    const originalArtifact = JSON.parse(readFileSync(bump.builder_receipt, "utf8")), expected = { repository: h.source_repository, source_commit: h.source_target, widget: "1.1.0", greeting: "Hello, Zoë." };
    if (JSON.stringify(originalArtifact) !== JSON.stringify(expected)) throw Error("original build artifact does not bind selected source/behavior");
    const preparedBytes = readFileSync(join(o.packet, "prepared-transport.jsonl"), "utf8"), currentPrefix = readFileSync(o.prepared_trace, "utf8").split("\n").filter(Boolean).slice(0, o.prepared_trace_lines).join("\n") + "\n";
    if (currentPrefix !== preparedBytes) throw Error("retained pre-review transport prefix changed");
    const rows = preparedBytes.trim().split("\n").map(line => JSON.parse(line)), order = builderOrder(rows, h.source_root, h.source_target, bump, o.primary_bot_commit);
    if (!order.pass) throw Error("retained actual committed build did not precede pointer application");
    const output = join(mkdtempSync(join(o.output, "builder-check-")), "artifact.json"), argv = [o.bun, "scripts/build.ts", "--output", output], result = Bun.spawnSync(argv, { cwd: h.source_root, stdout: "pipe", stderr: "pipe" }), built = result.exitCode === 0 ? JSON.parse(readFileSync(output, "utf8")) : null;
    if (result.exitCode !== 0 || JSON.stringify(built) !== JSON.stringify(expected)) throw Error("independent committed builder check failed");
    const primary_check = check(bump.root); if (primary_check.exit_code !== 0) throw Error("independent primary pointer check failed");
    satellite = { primary_check, pass: true, source_target: h.source_target, primary_target: bump.target, primary_bot_commit: o.primary_bot_commit, primary_batch_inputs, original_artifact: originalArtifact, original_build_trace_index: order.build_trace_index, original_bump_trace_index: order.application_trace_index, independent_build: { argv, cwd: h.source_root, exit_code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString(), artifact: built }, historical_order_provenance: "Retained actual fixture transport, not a newly witnessed historical action." };
  }
  const executableAfter = checkExecutable(o.bun, h.source_root);
  if (JSON.stringify(executableBefore) !== JSON.stringify(executableAfter)) throw Error("provided verification executable changed during checks");
  const after = snapshot(), result = { prior_reviews, owner_request, engineering, provided_executable: { before: executableBefore, after: executableAfter, preserved: true }, baseline_matches_expected_error: baseline_check.exit_code !== 0 && /Export named [\'\"]oldCall[\'\"] not found/.test(baseline_check.stderr), source_target: h.source_target, record_target: h.record_target, contract_check, baseline_check, source_check, normalizer_check, ancestry, preservation, definition_correspondence, related_source_preservation, satellite, correspondence: { pass: true, task_base: h.task_base, primary_inputs, contract_inputs, baseline_inputs, source_inputs, record: { target: h.record_target, path: h.record_path, mode: recordMode, sha256: hash(recordBytes) } }, before, after, preserved: JSON.stringify(before) === JSON.stringify(after) };
  writeFileSync(o.receipt, JSON.stringify(result, null, 2) + "\n", { flag: "wx" }); return result;
}
if (import.meta.main) {
  if (process.argv.length !== 3) throw Error("one fixed operator configuration is required");
  const result = runPairedChecks(JSON.parse(readFileSync(process.argv[2], "utf8"))); console.log(JSON.stringify({ source_target: result.source_target, record_target: result.record_target, baseline_matches_expected_error: result.baseline_matches_expected_error, baseline_check: result.baseline_check, source_check: result.source_check, normalizer_check: result.normalizer_check, preserved: result.preserved, definition: result.definition_correspondence, provided_executable: result.provided_executable, satellite: result.satellite ? { pass: result.satellite.pass, original_build_trace_index: result.satellite.original_build_trace_index, original_bump_trace_index: result.satellite.original_bump_trace_index, independent_build: result.satellite.independent_build } : null, full_receipt: "execution/receipt.json" }, null, 2));
  if (!result.preserved || result.contract_check.exit_code !== 0 || result.source_check.exit_code !== 0 || !result.baseline_matches_expected_error || result.baseline_check.exit_code === 0 || !result.normalizer_check.pass) process.exitCode = 1;
}
