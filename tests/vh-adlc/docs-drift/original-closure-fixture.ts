/** Complete synthetic original roles and real owned native Git refs for closure-controller tests. */
import { chmodSync, cpSync, existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "bun:test";
import { collectClosureWorkerInputs, collectClosureReviewTarget } from "../../../plugins/vh-adlc/scripts/docs-drift/closure-worker";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { effectDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { closureRuntimeFixture, closureVerificationPacket } from "./closure-runtime-fixture";
import { captureSyntheticRole, retainSyntheticArtifact, installOwnedNativeService } from "./original-publication-fixture";
import { evidence } from "./manifest-fixture";
import { git } from "./repository-fixture";

export async function originalClosureFixture(roots: string[], publisher?: Parameters<typeof closureRuntimeFixture>[4]) {
  const f = await closureRuntimeFixture(roots, "merge", "none", undefined, publisher), origin = join(f.adopted.root, "closure-origin");
  git(f.adopted.root, "clone", "--no-local", "--no-checkout", f.repo, origin);
  git(origin, "update-ref", "refs/heads/main", f.source);
  git(origin, "update-ref", "refs/pull/20/head", f.head);
  for (const original of f.proposals.values()) git(origin, "update-ref", "refs/pull/" + original.number + "/head", original.head_sha);
  const service = installOwnedNativeService({ root: f.adopted.root, origin, source: f.source, head: f.source, publisher_identity: publisher?.identities[publisher.entry] });
  const state = JSON.parse(readFileSync(service.statePath, "utf8")), responses = JSON.parse(readFileSync(f.responses_file, "utf8"));
  // Native pull responses include the metadata needed for pre-dispatch delivery baselines.
  state.prs = [responses["repos/fixture/docs/pulls/1"], responses["repos/fixture/docs/pulls/20"]]
    .map((proposal: Record<string, unknown>) => ({ ...proposal, title: proposal.title ?? "Synthetic closure proposal", labels: proposal.labels ?? [] }));
  writeFileSync(service.statePath, JSON.stringify(state));
  const options = { ...f.options, path: join(f.adopted.root, "native-bin") + ":" + process.env.PATH };
  const current = await collectClosureWorkerInputs(options);
  expect(current.complete, JSON.stringify(current.diagnostics)).toBe(true);
  const worker = captureSyntheticRole(f.artifacts, f.source, "worker", current.worker_runtime_sha256!,
    evidence("closure-controller-worker", current.worker_input_sha256!, canonicalJSON(closureVerificationPacket(f, current)).toString()));
  const target = await collectClosureReviewTarget({ ...options, worker_capture: worker });
  expect(target.complete, JSON.stringify(target.diagnostics)).toBe(true);
  const reviewer = captureSyntheticRole(f.artifacts, f.source, "reviewer", target.reviewer_runtime_sha256!,
    evidence("closure-controller-reviewer", target.manifest_sha256!, "NO FINDINGS\n"));
  const request = retainSyntheticArtifact(f.artifacts, "closure-owner-request.txt", Buffer.from("Synthetic exact owner request approves the shown original closure batch, lease, receipt, explanations and release.\n"));
  const authority = retainSyntheticArtifact(f.artifacts, "closure-authority.json", canonicalJSON({ schema_version: 1, kind: "docs-drift-publication-authority", manifest_sha256: target.manifest_sha256,
    origin: { kind: "owner-request", artifact: request }, effects: target.manifest!.effects.map(effect => ({ id: effect.id, sha256: effectDigest([effect]) })) }));
  return { ...f, origin, service, worker, reviewer, target, publication: { ...options, worker_capture: worker, reviewer_capture: reviewer, authority } };
}

type ClosureFixture = Awaited<ReturnType<typeof originalClosureFixture>>;
const shared = new WeakMap<string[], { fixture: ClosureFixture; trees: [live: string, pristine: string][] }>();

/**
 * The default closure fixture, built once per roots list. The first call returns the freshly built
 * fixture; every later call first restores each fixture root to its pristine copy, so each test still
 * starts from unchanged state. Directories are restored in place because the run directory's identity
 * includes its inode.
 */
export async function sharedOriginalClosureFixture(roots: string[]): Promise<ClosureFixture> {
  const existing = shared.get(roots);
  if (existing) {
    for (const [live, pristine] of existing.trees) restoreTree(pristine, live);
    return existing.fixture;
  }
  const start = roots.length, fixture = await originalClosureFixture(roots), live = roots.slice(start);
  const used = [fixture.repo, fixture.origin, fixture.artifacts, fixture.adopted.root, fixture.adopted.retained.directory,
    fixture.service.statePath, fixture.service.calls, fixture.options.cache_directory];
  for (const path of used) {
    const real = realpathSync(path);
    if (!live.some(root => real === realpathSync(root) || real.startsWith(realpathSync(root) + "/")))
      throw Error("Shared closure fixture path outside its owned roots: " + path);
  }
  const trees = live.map(root => {
    const pristine = root + ".pristine";
    cpSync(root, pristine, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
    roots.push(pristine);
    return [root, pristine] as [string, string];
  });
  shared.set(roots, { fixture, trees });
  return fixture;
}

function restoreTree(source: string, target: string): void {
  const wanted = new Set(readdirSync(source));
  for (const name of readdirSync(target)) if (!wanted.has(name)) rmSync(join(target, name), { recursive: true, force: true });
  for (const name of wanted) {
    const from = join(source, name), to = join(target, name), kind = lstatSync(from);
    const current = existsSync(to) || isSymlink(to) ? lstatSync(to) : null;
    if (kind.isDirectory() && current?.isDirectory()) { restoreTree(from, to); continue; }
    if (current) rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
  }
  chmodSync(target, lstatSync(source).mode & 0o7777);
}

function isSymlink(path: string): boolean {
  try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
}
