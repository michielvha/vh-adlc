/** Owned Git and observed-shaped adoption parser fixtures; no provider or delivery trial. */
import { afterAll, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { write, commit, runtimeIdentity } from "./adoption-fixture";
import { preflightFixture } from "./preflight-fixture";
import { put } from "./repository-fixture";
import { verifyProductionPreflight } from "../../../plugins/vh-adlc/scripts/docs-drift/preflight";
import { fixture, bindings, hash, role } from "./manifest-fixture";
import { readGit, writeMetadataObject } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { captureRepositoryState, captureSnapshot, createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { deriveWorkerInputs } from "../../../plugins/vh-adlc/scripts/docs-drift/publication-worker";
import { readCandidatePatch, readOwnedPatch } from "../../../plugins/vh-adlc/scripts/docs-drift/preparation";
import { correctionProjection, deliveryDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/report";
import type { CorrectionInput } from "../../../plugins/vh-adlc/scripts/docs-drift/report";
import { resolutionSource } from "../../../plugins/vh-adlc/scripts/docs-drift/resolve";
import { publicationMarker, readReviewedProposal, type NativePublicationBinding } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { effectMarker, validateReviewedManifest, type Effect, type Bindings } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { sealPlan, writePlanObject, policyBinding } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { canonicalDigest, canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import type { PullRequestInput } from "../../../plugins/vh-adlc/scripts/github-read";
import { createGitHubReader, createRepositoryReader } from "../../../plugins/vh-adlc/scripts/github-read";
import { loadCommittedSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";

const roots: string[] = []; let failed = false;
afterAll(() => {
  if (failed) console.error("Preserved failed owned reviewed-publication roots", JSON.stringify(roots));
  else for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test.each([
  { fault: "matching", producer: undefined, entry: undefined },
  { fault: "changed-ref", producer: undefined, entry: undefined },
  { fault: "changed-body", producer: undefined, entry: undefined },
  { fault: "matching", producer: "hosted" as const, entry: "copilot" as const },
  { fault: "matching", producer: "copilot" as const, entry: "hosted" as const },
  { fault: "matching", producer: "claude" as const, entry: "copilot" as const },
  { fault: "native-casing", producer: "copilot" as const, entry: "hosted" as const },
])("original native receipt lookup rechecks $fault for $producer read by $entry", async ({ fault, producer, entry }) => {
  try {
    const { createAdoptedPublicationVerifier } = await import("../../../plugins/vh-adlc/scripts/docs-drift/reviewed-publication");
    const f = setup("matching", producer), objects = writePlanObject(f.store, f.plan), planBytes = canonicalJSON(f.plan), prefix = "repos/fixture/docs";
    const bin = join(f.artifacts, "reader-bin"); mkdirSync(bin, { mode: 0o700 });
    const responsesPath = join(f.artifacts, "native-plan-responses.json"), callsPath = join(f.artifacts, "native-plan-reads.jsonl");
    const repository = { id: 10, full_name: "fixture/docs", default_branch: "main" }, refPath = prefix + "/git/ref/" + f.native.ref.slice(5);
    const pull = { number: 11, state: "open", merged_at: null, body: f.proposal.body, draft: f.proposal.draft,
      user: { id: f.proposal.actor_id, login: fault === "native-casing" ? f.proposal.actor.toUpperCase() : f.proposal.actor, type: f.proposal.actor_type }, head: { sha: f.native.head, ref: f.proposal.head_ref, repo: repository },
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
    const readerIdentity = entry === "copilot" ? { ...runtimeIdentity, actor: "fixture-owner", actor_id: 30 } : runtimeIdentity;
    const verify = createAdoptedPublicationVerifier({ store: f.store, current_default: f.current, identity: readerIdentity, entry, proposal: original });
    const options = { reader, settings: loadCommittedSettings(f.repo, f.current).settings, proposal: original, verifyPlan: verify };
    const baseline = await readReviewedProposal(options);
    expect(baseline.receipt).toMatchObject({ object: objects.object, plan_sha256: sha256(planBytes), ref: f.native.ref });
    expect(baseline.reviewed.corrections).toEqual([correctionProjection(f.correction)]);
    expect(baseline.reviewed.actor).toBe(f.plan.manifest.actor);
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

function reseal(f: ReturnType<typeof setup>, mutate: (value: { bindings: Bindings; effects: Effect[]; corrections: CorrectionInput[] }) => void) {
  const data = structuredClone({ bindings: f.plan.manifest.bindings, effects: f.plan.manifest.effects, corrections: f.plan.corrections });
  mutate(data); data.bindings.delivery_sha256 = deliveryDigest(data.corrections, []);
  const input = fixture(data.bindings, data.effects, f.plan.manifest.operation_id, { actor: f.plan.manifest.actor,
    actor_id: f.plan.manifest.actor_id, publisher_entry: f.plan.manifest.publisher_entry });
  return sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...policyBinding(f.plan),
    publication_kind: "advisory", context: "production", transport: "native", corrections: data.corrections, attention: [] });
}

test.each(["current", "head"])("an existing non-ancestor source is ineligible rather than unavailable: %s", async relation => {
  try {
    const { createAdoptedPublicationVerifier, RetainedPublicationIneligible } = await import("../../../plugins/vh-adlc/scripts/docs-drift/reviewed-publication");
    const f = setup(); let current = f.current, source = f.native.head;
    if (relation === "head") {
      const tree = readGit(f.store.root, "rev-parse", f.current + "^{tree}").toString().trim();
      current = writeMetadataObject(f.store.root, "commit", Buffer.from(`tree ${tree}\nparent ${f.current}\nauthor Fixture <fixture@example.invalid> 1 +0000\ncommitter Fixture <fixture@example.invalid> 1 +0000\n\nOwned sibling default\n`));
      source = current;
    }
    const verify = createAdoptedPublicationVerifier({ store: f.store, current_default: current, identity: runtimeIdentity, proposal: f.proposal });
    expect(verify(canonicalJSON(f.plan), f.native).corrections).toEqual([correctionProjection(f.correction)]);
    const before = captureRepositoryState(f.repo), changed = reseal(f, value => { value.bindings.source_commit = source; });
    let denied: unknown; try { verify(canonicalJSON(changed), f.native); } catch (error) { denied = error; }
    expect(denied).toBeInstanceOf(RetainedPublicationIneligible);
    expect((denied as Error).message).toBe("docs-drift retained publication original source is not an ancestor of the current default or proposal head");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 90000);

test.each(["correction-postimage", "correction-patch", "correction-inputs", "effect-body", "observed-draft", "update-matching",
  "update-number", "update-head", "deleted-matching", "deleted-absence", "candidate-settings"])("retained publication guard keeps a successful baseline and checks its exact payload: %s", async fault => {
  try {
    const { createAdoptedPublicationVerifier, RetainedPublicationIneligible } = await import("../../../plugins/vh-adlc/scripts/docs-drift/reviewed-publication");
    const f = setup(), original = createAdoptedPublicationVerifier({ store: f.store, current_default: f.current, identity: runtimeIdentity, proposal: f.proposal });
    expect(original(canonicalJSON(f.plan), f.native).corrections).toEqual([correctionProjection(f.correction)]);
    const proposal = structuredClone(f.proposal), native = structuredClone(f.native);
    if (fault.startsWith("deleted-")) readGit(f.repo, "rm", "--", "docs/guide.md");
    if (fault === "candidate-settings") write(f.repo, ".vh-adlc/docs-drift.yaml", canonicalJSON({ ...f.configured,
      detector_options: { ...f.configured.detector_options, [f.configured.required_detectors[0]]: { synthetic_change: true } } }));
    if (fault.startsWith("deleted-") || fault === "candidate-settings") {
      const head = commit(f.repo, "synthetic changed candidate for " + fault);
      readGit(f.store.root, "-c", "protocol.file.allow=always", "fetch", "--no-write-fetch-head", "--no-tags", "--no-auto-maintenance", "--", f.repo, head);
      proposal.head_sha = head; native.head = head; native.tree = readGit(f.store.root, "rev-parse", head + "^{tree}").toString().trim();
    }
    if (fault === "observed-draft") proposal.draft = !proposal.draft;
    const plan = reseal(f, value => {
      value.bindings.candidate_commit = native.head; value.bindings.candidate_tree = native.tree;
      value.bindings.diff_sha256 = sha256(readOwnedPatch(f.store, f.configured.repository, f.current, native.head));
      const push = value.effects.find(effect => effect.kind === "push")!; push.payload.head = native.head;
      const pr = value.effects.find(effect => effect.kind === "pr-create")!;
      if (fault === "effect-body") pr.payload.body = String(pr.payload.body) + "\nA different reviewed explanation";
      if (fault.startsWith("update-")) {
        const expected = { title: "Prior synthetic title", body: "Prior synthetic body", labels: [], draft: false };
        pr.kind = "pr-update"; pr.payload = { number: fault === "update-number" ? 12 : 11,
          expected_head: fault === "update-head" ? f.current : native.head, expected_payload: expected, expected_payload_sha256: canonicalDigest(expected),
          title: pr.payload.title, body: pr.payload.body, labels: pr.payload.labels, draft: pr.payload.draft };
      }
      const correction = value.corrections[0];
      if (fault.startsWith("deleted-")) {
        correction.patch_sha256 = sha256(readOwnedPatch(f.store, f.configured.repository, f.current, native.head, [correction.path]));
        correction.postimage_sha256 = fault === "deleted-absence" ? hash("invented deleted postimage") : canonicalDigest({ path: correction.path, absent: true });
      }
      if (fault === "correction-postimage") correction.postimage_sha256 = hash("changed postimage");
      if (fault === "correction-patch") correction.patch_sha256 = hash("changed patch");
      if (fault === "correction-inputs") correction.inputs_sha256 = hash("changed source inputs");
    });
    const before = captureRepositoryState(f.repo), verify = createAdoptedPublicationVerifier({ store: f.store, current_default: f.current, identity: runtimeIdentity, proposal });
    if (["update-matching", "deleted-matching"].includes(fault)) {
      expect(verify(canonicalJSON(plan), native).corrections).toEqual(plan.corrections.map(correctionProjection));
    } else {
      const reason = fault.startsWith("correction-") || fault === "deleted-absence" ? "normalized correction bindings changed"
        : fault === "candidate-settings" ? "candidate configuration changed"
        : fault === "update-head" ? "reviewed policy or publication shape changed" : "exact reviewed proposal payload unavailable";
      let denied: unknown; try { verify(canonicalJSON(plan), native); } catch (error) { denied = error; }
      expect(denied).toBeInstanceOf(RetainedPublicationIneligible); expect((denied as Error).message).toBe("docs-drift retained publication " + reason);
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 90000);

test.each(["shallow-history", "ancestry-command-failure"])("unavailable ancestry evidence cannot become an ineligible-plan verdict: %s", async fault => {
  try {
    const { createAdoptedPublicationVerifier, RetainedPublicationIneligible } = await import("../../../plugins/vh-adlc/scripts/docs-drift/reviewed-publication");
    const f = setup(), verify = createAdoptedPublicationVerifier({ store: f.store, current_default: f.current, identity: runtimeIdentity, proposal: f.proposal });
    expect(verify(canonicalJSON(f.plan), f.native).corrections).toEqual([correctionProjection(f.correction)]);
    const before = captureRepositoryState(f.repo), oldPath = process.env.PATH;
    let denied: unknown;
    try {
      if (fault === "shallow-history") writeFileSync(join(f.store.root, "shallow"), f.current + "\n", { mode: 0o600 });
      else {
        const git = Bun.which("git"), bin = join(f.artifacts, "ancestry-fault-bin"); if (!git) throw Error("Fixture Git unavailable");
        mkdirSync(bin, { mode: 0o700 }); writeFileSync(join(bin, "git"), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes("merge-base") && args.includes("--is-ancestor")) process.exit(2);
const result = Bun.spawnSync([${JSON.stringify(git)}, ...args], { env: process.env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
process.exit(result.exitCode);
`, { mode: 0o700 }); process.env.PATH = bin + ":" + oldPath;
      }
      try { verify(canonicalJSON(f.plan), f.native); } catch (error) { denied = error; }
    } finally { if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; }
    expect(denied).toBeInstanceOf(Error); expect(denied).not.toBeInstanceOf(RetainedPublicationIneligible);
    expect((denied as Error).message).toBe("docs-drift retained publication original evidence unavailable");
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 90000);

function setup(fault = "matching", producer?: "hosted" | "copilot" | "claude", publisherOverride?: Parameters<typeof fixture>[3]) {
  const accounts = { hosted: { actor: "fixture-bot", actor_id: 20 }, copilot: { actor: "fixture-owner", actor_id: 30 },
    claude: { actor: "fixture-owner", actor_id: 30 } };
  const entry = producer ?? "hosted", publisher = publisherOverride ?? { publisher_entry: entry, ...accounts[entry] };
  const base = preflightFixture(roots, "none", undefined, (repo, configured) => {
    const profile = configured.execution.entries.interactive;
    for (const selected of Object.values(configured.execution.entries)) {
      selected.worker.model = role.requested_model; selected.reviewer.model = role.requested_model;
    }
    Object.assign(configured.execution.entries, { copilot: profile, claude: profile });
    Object.assign(configured.publication, { entry_actors: { hosted: accounts.hosted.actor, interactive: accounts.copilot.actor,
      copilot: accounts.copilot.actor, claude: accounts.claude.actor } });
    configured.pr_discovery.authors = [accounts.hosted.actor, accounts.copilot.actor];
    for (const path of configured.feedback_files) put(repo, path, "[]\n");
  });
  const f = { ...base, configured: base.afterSettings, candidate: base.checklist.candidate_commit }, current = f.head(), snapshot = captureSnapshot(f.repo, current);
  const originalPolicy = verifyProductionPreflight({ repo: f.repo, current_default: current, component: f.component });
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
  const validInput = fixture({ ...selected, settings_sha256: snapshot.settings_sha256, source_commit: current,
    diff_sha256: sha256(readOwnedPatch(store, f.configured.repository, current, head)) }, effects.map(effect => effect.kind === "pr-create"
      ? { ...effect, payload: { ...effect.payload, branch: "docs-drift/one" } } : effect), "operation-1", publisher);
  const validPlan = sealPlan({ reviewed: validateReviewedManifest(validInput), grants: validInput.grants,
    schema_version: 2, policy_sha256: originalPolicy.policy_sha256, component: f.component, publication_kind: "advisory", context: "production", transport: "native", corrections: [correction], attention: [] });
  const input = fixture(selected, effects, "operation-1", publisher);
  if (fault === "wrong-requested-role") input.policy.worker = { ...role, requested_model: "claude-opus-5.5" };
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants,
    schema_version: 2, policy_sha256: fault === "unknown-policy" ? hash("unknown policy") : originalPolicy.policy_sha256, component: f.component,
    publication_kind: "advisory", context: fault === "trial" ? "trial" : "production", transport: fault === "trial" ? "collector" : "native",
    corrections: [correction], attention: [] });
  const repository = { id: 10, full_name: f.configured.repository, default_branch: "main" };
  const proposal: PullRequestInput = { number: 11, state: "open", merged_at: null, body, draft, actor: publisher?.actor ?? runtimeIdentity.actor,
    actor_id: publisher?.actor_id ?? runtimeIdentity.actor_id, actor_type: "Bot", head_sha: head, head_ref: "docs-drift/one", head_repository: repository,
    base_sha: current, base_ref: "main", base_repository: repository };
  const native: Omit<NativePublicationBinding, "corrections" | "attention"> = { repository: f.configured.repository, repository_id: 10,
    operation_id: "operation-1", actor: publisher?.actor ?? runtimeIdentity.actor, actor_id: publisher?.actor_id ?? runtimeIdentity.actor_id, head, tree,
    body_sha256: sha256(Buffer.from(body)), ref: f.configured.publication.receipt_ref_prefix + "operation-1", object: current };
  return { ...f, current, store, proposal, native, plan, validPlan, correction };
}

test.each(["matching", "unknown-policy", "trial", "wrong-settings", "wrong-requested-role", "wrong-branch",
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
    } else if (["missing-source-object", "unknown-policy", "wrong-requested-role"].includes(fault)) {
      let denied: unknown; try { verify(canonicalJSON(f.plan), f.native); } catch (error) { denied = error; }
      expect(denied).toBeInstanceOf(Error); expect(denied).not.toBeInstanceOf(RetainedPublicationIneligible);
      expect((denied as Error).message).toBe("docs-drift retained publication original evidence unavailable");
    } else {
      const packet = fault === "malformed-plan" ? Buffer.from('{"unreviewed":true}\n') : canonicalJSON(f.plan);
      const reasons: Record<string, string> = {
        trial: "requires production native evidence",
        "wrong-settings": "original source bindings changed",
        "wrong-branch": "exact reviewed proposal payload unavailable", "wrong-tree": "candidate tree or complete diff changed",
        "wrong-diff": "candidate tree or complete diff changed", "malformed-plan": "invalid retained plan",
      };
      let denied: unknown; try { verify(packet, f.native); } catch (error) { denied = error; }
      expect(denied).toBeInstanceOf(RetainedPublicationIneligible);
      expect((denied as Error).message).toBe("docs-drift retained publication " + (reasons[fault] ?? "native publication identity or receipt changed"));
    }
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
});


test.each([
  { producer: "hosted" as const, entry: "copilot" as const, actor: "fixture-owner", actor_id: 30 },
  { producer: "copilot" as const, entry: "hosted" as const, actor: "fixture-bot", actor_id: 20 },
  { producer: "claude" as const, entry: "copilot" as const, actor: "fixture-owner", actor_id: 30 },
])("a $entry reader verifies a $producer proposal through its original producer account", async ({ producer, entry, actor, actor_id }) => {
  try {
    const { createAdoptedPublicationVerifier } = await import("../../../plugins/vh-adlc/scripts/docs-drift/reviewed-publication");
    const f = setup("matching", producer), bytes = canonicalJSON(f.plan), before = captureRepositoryState(f.repo);
    const identity = { ...runtimeIdentity, actor, actor_id };
    const verify = createAdoptedPublicationVerifier({ store: f.store, current_default: f.current, identity, entry, proposal: f.proposal });
    expect(verify(bytes, f.native).corrections).toEqual([correctionProjection(f.correction)]);
    const recased = { ...f.proposal, actor: f.proposal.actor.toUpperCase() };
    const recasedNative = { ...f.native, actor: recased.actor };
    const recasedVerify = createAdoptedPublicationVerifier({ store: f.store, current_default: f.current, identity, entry, proposal: recased });
    expect(recasedVerify(bytes, recasedNative).actor).toBe(f.plan.manifest.actor);
    expect(() => recasedVerify(bytes, { ...recasedNative, actor_id: recasedNative.actor_id + 1 })).toThrow();
    expect(() => createAdoptedPublicationVerifier({ store: f.store, current_default: f.current, identity: { ...identity, actor_id: actor_id + 1 },
      entry, proposal: f.proposal })).toThrow();
    expect(canonicalJSON(f.plan)).toEqual(bytes);
    expect(captureRepositoryState(f.repo)).toEqual(before);
  } catch (error) { failed = true; throw error; }
}, 90000);


test.each([
  { actor: "fixture-owner", actor_id: 31, publisher_entry: "copilot" as const },
  { actor: "fixture-owner", actor_id: 30, publisher_entry: "hosted" as const },
])("original producer policy refuses internally consistent forged attribution $publisher_entry/$actor_id", async forged => {
  const { createAdoptedPublicationVerifier, RetainedPublicationIneligible } = await import("../../../plugins/vh-adlc/scripts/docs-drift/reviewed-publication");
  const f = setup("matching", "copilot", forged), before = captureRepositoryState(f.repo);
  expect(f.plan.manifest.actor_id).toBe(f.native.actor_id);
  expect(f.proposal.actor_id).toBe(f.native.actor_id);
  const verify = createAdoptedPublicationVerifier({ store: f.store, current_default: f.current, identity: runtimeIdentity,
    entry: "hosted", proposal: f.proposal });
  const runtime = await import("../../../plugins/vh-adlc/scripts/docs-drift/bootstrap"), original = runtime.readOriginalProductionPolicy;
  const calls: Array<Parameters<typeof original>[0]> = [];
  const check = spyOn(runtime, "readOriginalProductionPolicy").mockImplementation(input => { calls.push(input); return original(input); });
  let rejected: unknown;
  try { verify(canonicalJSON(f.plan), f.native); } catch (error) { rejected = error; }
  finally { check.mockRestore(); }
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ plan: { manifest: { publisher_entry: forged.publisher_entry } },
    identity: { actor: forged.actor, actor_id: forged.actor_id } });
  expect(rejected).toBeInstanceOf(Error);
  expect(rejected).not.toBeInstanceOf(RetainedPublicationIneligible);
  expect((rejected as Error).message).toBe("docs-drift retained publication original evidence unavailable");
  expect(captureRepositoryState(f.repo)).toEqual(before);
}, 90000);
