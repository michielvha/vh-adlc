/** Owned Git and observed-shaped adoption parser fixtures; no provider or delivery trial. */
import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { source, write, commit, portableRecord, deliverRecord, runtimeIdentity } from "./adoption-fixture";
import { fixture, bindings, hash, role } from "./manifest-fixture";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState, captureSnapshot, createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { deriveWorkerInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-worker";
import { readCandidatePatch, readOwnedPatch } from "../../../plugins/vh-adlc/scripts/docs-drift/preparation";
import { correctionProjection, deliveryDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/report";
import { resolutionSource } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve";
import { publicationMarker, readReviewedProposal, type NativePublicationBinding } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { effectMarker, validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { sealPlan, writePlanObject } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { canonicalDigest, canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import type { PullRequestInput } from "../../../plugins/vh-adlc/scripts/github-read";
import { createGitHubReader, createRepositoryReader } from "../../../plugins/vh-adlc/scripts/github-read";
import { loadCommittedSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";

const roots: string[] = []; let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed owned reviewed-publication roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test.each(["matching", "changed-ref", "changed-body"])("original native receipt lookup composes with adopted verification and rechecks mutable inputs: %s", async fault => {
  try {
    const { createAdoptedPublicationVerifier } = await import("../../../plugins/vh-adlc/scripts/docs-drift/reviewed-publication");
    const f = setup(), objects = writePlanObject(f.store, f.plan), planBytes = canonicalJSON(f.plan), prefix = "repos/fixture/docs";
    const bin = join(f.artifacts, "reader-bin"); mkdirSync(bin, { mode: 0o700 });
    const responsesPath = join(f.artifacts, "native-plan-responses.json"), callsPath = join(f.artifacts, "native-plan-reads.jsonl");
    const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" }, refPath = prefix + "/git/ref/" + f.native.ref.slice(5);
    const pull = { number: 11, state: "open", merged_at: null, body: f.proposal.body, draft: f.proposal.draft,
      user: { id: 20, login: "fixture-bot", type: "Bot" }, head: { sha: f.native.head, ref: f.proposal.head_ref, repo: repository },
      base: { sha: f.current, ref: "main", repo: repository } };
    const responses: Record<string, unknown> = {
      [prefix]: repository, [prefix + "/pulls/11"]: pull,
      [refPath]: { ref: f.native.ref, object: { type: "commit", sha: objects.object } },
      [prefix + "/git/commits/" + objects.object]: { sha: objects.object, tree: { sha: objects.tree }, parents: [], message: "Owned synthetic receipt" },
      [prefix + "/git/trees/" + objects.tree]: { sha: objects.tree, truncated: false, tree: [{ path: "plan.json", mode: "100644", type: "blob", sha: objects.blob }] },
      [prefix + "/git/blobs/" + objects.blob]: { sha: objects.blob, size: planBytes.length, encoding: "base64", content: planBytes.toString("base64") },
      [prefix + "/git/commits/" + f.native.head]: { sha: f.native.head, tree: { sha: f.native.tree }, parents: [{ sha: f.current }], message: "Owned synthetic candidate" },
    };
    writeFileSync(responsesPath, JSON.stringify(responses), { mode: 0o600 });
    const executable = join(bin, "gh"); writeFileSync(executable, `#!${process.execPath}
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args[0] !== "api" || args[args.indexOf("--method") + 1] !== "GET") process.exit(91);
appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify(args) + "\\n", { mode: 0o600 });
const value = JSON.parse(readFileSync(${JSON.stringify(responsesPath)}, "utf8"))[args.at(-1)];
if (value === undefined) { console.log("HTTP/2.0 404 Not Found\\r\\n\\r\\n{}"); process.exit(1); }
console.log("HTTP/2.0 200 OK\\r\\n\\r\\n" + JSON.stringify(value));
`, { mode: 0o700 }); chmodSync(executable, 0o700);
    const reader = createRepositoryReader(createGitHubReader("github.com", { inherit_env: false, env: { PATH: bin, GH_TOKEN: "synthetic-read-only" } }), "fixture/docs");
    const original = reader.pull(11), before = captureRepositoryState(f.repo);
    const verify = createAdoptedPublicationVerifier({ store: f.store, current_default: f.current, identity: runtimeIdentity, proposal: original });
    const options = { reader, settings: loadCommittedSettings(f.repo, f.current).settings, proposal: original, verifyPlan: verify };
    const baseline = await readReviewedProposal(options);
    expect(baseline.receipt).toMatchObject({ object: objects.object, plan_sha256: sha256(planBytes), ref: f.native.ref });
    expect(baseline.reviewed.corrections).toEqual([correctionProjection(f.correction)]);
    if (fault !== "matching") {
      await expect(readReviewedProposal({ ...options, verifyPlan: (bytes, native) => {
        const verified = verify(bytes, native);
        if (fault === "changed-ref") responses[refPath] = { ref: f.native.ref, object: { type: "commit", sha: "f".repeat(40) } };
        else responses[prefix + "/pulls/11"] = { ...pull, body: pull.body + "\nPreserve a later owner edit" };
        writeFileSync(responsesPath, JSON.stringify(responses), { mode: 0o600 }); return verified;
      } })).rejects.toThrow("native publication changed during read");
    }
    const calls: string[][] = readFileSync(callsPath, "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(calls.length).toBeGreaterThan(5); expect(calls.every(args => args[args.indexOf("--method") + 1] === "GET")).toBe(true);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 90000);

function setup(fault = "matching") {
  const f = source(roots, { role: { model: role.requested_model, native_model: role.adopted_model, identity_source: role.identity_source } });
  for (const path of f.configured.feedback_files) write(f.repo, path, "[]\n");
  f.candidate = commit(f.repo, "synthetic complete feedback inputs");
  const current = deliverRecord(f, portableRecord(f)), snapshot = captureSnapshot(f.repo, current);
  write(f.repo, "docs/guide.md", "Synthetic reviewed correction\n"); const head = commit(f.repo, "synthetic reviewed candidate");
  const store = createOwnedObjectStore({ parent: f.artifacts, evidence_directory: f.artifacts, source_repo: f.repo,
    source_commit: current, repository: f.configured.repository, owner: "synthetic-review", run: "retained-plan" });
  // The production collector fetches each observed head; this fixture uses its exact owned local object.
  readGit(store.root, "-c", "protocol.file.allow=always", "fetch", "--no-write-fetch-head", "--no-tags", "--no-auto-maintenance", "--", f.repo, head);
  const tree = readGit(store.root, "rev-parse", head + "^{tree}").toString().trim();
  const body = "Synthetic reviewed advisory\n" + publicationMarker(snapshot.settings, "operation-1") + "\n" + effectMarker("pr");
  const draft = snapshot.settings.publication.pr_state.advisory === "draft";
  const effects: Effect[] = [
    { id: "lease", kind: "lease-acquire", payload: { ref: snapshot.settings.publication.lease_ref } },
    { id: "receipt", kind: "receipt-retain", payload: { ref: snapshot.settings.publication.receipt_ref_prefix + "operation-1" } },
    { id: "push", kind: "push", payload: { ref: "refs/heads/docs-drift/one", head } },
    { id: "pr", kind: "pr-create", payload: { base: "main", branch: fault === "wrong-branch" ? "docs-drift/another" : "docs-drift/one",
      title: "Synthetic documentation repair", body, labels: ["documentation"], draft } },
    { id: "release", kind: "lease-release", payload: { ref: snapshot.settings.publication.lease_ref } },
  ];
  const correction = { repository: f.configured.repository, scope_sha256: snapshot.protocol.bindings.scope_sha256,
    identity: "correction-" + canonicalDigest({ path: "docs/guide.md" }), path: "docs/guide.md",
    patch_sha256: sha256(readOwnedPatch(store, f.configured.repository, current, head, ["docs/guide.md"])),
    postimage_sha256: sha256(readGit(store.root, "show", head + ":docs/guide.md")),
    verification_sha256: hash("synthetic normalized historical verification"), inputs_sha256: canonicalDigest(resolutionSource(snapshot)) };
  const selected = { ...bindings, ...deriveWorkerInputs({ snapshot, assessment_sha256: hash("synthetic original assessment"),
    source_verification: { path: "synthetic-source.json", sha256: hash("synthetic source proof") },
    decisions_sha256: hash("synthetic decisions"), proposals_sha256: hash("synthetic inventory") }),
    candidate_commit: head, candidate_tree: tree, diff_sha256: sha256(readOwnedPatch(store, f.configured.repository, current, head)),
    delivery_sha256: deliveryDigest([correction], []) };
  if (fault === "wrong-settings") selected.settings_sha256 = hash("foreign settings");
  if (fault === "missing-source-object") selected.source_commit = "f".repeat(40);
  if (fault === "wrong-diff") selected.diff_sha256 = hash("foreign complete diff");
  const adoptionSHA = sha256(readGit(store.root, "show", current + ":" + f.configured.publication.adoption_record));
  const validInput = fixture({ ...selected, settings_sha256: snapshot.settings_sha256, source_commit: current,
    diff_sha256: sha256(readOwnedPatch(store, f.configured.repository, current, head)) }, effects.map(effect => effect.kind === "pr-create"
      ? { ...effect, payload: { ...effect.payload, branch: "docs-drift/one" } } : effect));
  const validPlan = sealPlan({ reviewed: validateReviewedManifest(validInput), grants: validInput.grants,
    adoption_sha256: adoptionSHA, publication_kind: "advisory", context: "production", transport: "native", corrections: [correction], attention: [] });
  const input = fixture(selected, effects);
  if (fault === "wrong-requested-role") input.policy.worker = { ...role, requested_model: "claude-opus-5.5" };
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants,
    adoption_sha256: fault === "unknown-adoption" ? hash("unknown adoption") : adoptionSHA,
    publication_kind: "advisory", context: fault === "trial" ? "trial" : "production", transport: fault === "trial" ? "collector" : "native",
    corrections: [correction], attention: [] });
  const repository = { id: 10, full_name: f.configured.repository, default_branch: "main" };
  const proposal: PullRequestInput = { number: 11, state: "open", merged_at: null, body, draft, actor: runtimeIdentity.actor,
    actor_id: runtimeIdentity.actor_id, actor_type: "Bot", head_sha: head, head_ref: "docs-drift/one", head_repository: repository,
    base_sha: current, base_ref: "main", base_repository: repository };
  const native: Omit<NativePublicationBinding, "corrections" | "attention"> = { repository: f.configured.repository, repository_id: 10,
    operation_id: "operation-1", actor: runtimeIdentity.actor, actor_id: runtimeIdentity.actor_id, head, tree,
    body_sha256: sha256(Buffer.from(body)), ref: f.configured.publication.receipt_ref_prefix + "operation-1", object: current };
  return { ...f, current, store, proposal, native, plan, validPlan, correction };
}

test.each(["matching", "unknown-adoption", "trial", "wrong-settings", "wrong-requested-role", "wrong-branch",
  "foreign-repository", "foreign-actor", "wrong-tree", "changed-body", "foreign-ref", "wrong-diff", "missing-source-object", "malformed-plan"])("native retained-plan verification uses adopted source rather than self approval: %s", async fault => {
  try {
    const { createAdoptedPublicationVerifier, RetainedPublicationIneligible } = await import("../../../plugins/vh-adlc/scripts/docs-drift/reviewed-publication");
    const f = setup(fault), before = captureRepositoryState(f.repo);
    const verify = createAdoptedPublicationVerifier({ store: f.store, current_default: f.current, identity: runtimeIdentity, proposal: f.proposal });
    const baseline = verify(canonicalJSON(f.validPlan), f.native);
    expect(baseline.corrections).toEqual([correctionProjection(f.correction)]);
    if (fault === "foreign-repository") f.native.repository_id++;
    if (fault === "foreign-actor") f.native.actor_id++;
    if (fault === "wrong-tree") f.native.tree = "f".repeat(40);
    if (fault === "changed-body") f.native.body_sha256 = hash("later owner edit");
    if (fault === "foreign-ref") f.native.ref += "-foreign";
    if (fault === "matching") {
      expect(() => readCandidatePatch(f.store, f.configured.repository, f.current, f.native.head)).toThrow("Candidate patch requires exact retained commits");
      const result = baseline; expect(canonicalJSON(f.plan).equals(canonicalJSON(f.validPlan))).toBe(true);
      expect(result).toMatchObject({ repository: f.native.repository, repository_id: 10, actor_id: 20,
        head: f.native.head, tree: f.native.tree, body_sha256: f.native.body_sha256, corrections: [correctionProjection(f.correction)], attention: [] });
      expect(result).not.toHaveProperty("grants"); expect(result).not.toHaveProperty("current_verification");
    } else if (fault === "missing-source-object") {
      let denied: unknown; try { verify(canonicalJSON(f.plan), f.native); } catch (error) { denied = error; }
      expect(denied).toBeInstanceOf(Error); expect(denied).not.toBeInstanceOf(RetainedPublicationIneligible);
      expect((denied as Error).message).toBe("docs-drift retained publication original evidence unavailable");
    } else {
      const packet = fault === "malformed-plan" ? Buffer.from('{"unreviewed":true}\n') : canonicalJSON(f.plan);
      expect(() => verify(packet, f.native)).toThrow(RetainedPublicationIneligible);
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
});
