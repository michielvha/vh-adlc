import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { nativePushArguments } from "../../../plugins/vh-adlc/scripts/docs-drift/git-success";
import { createJournal, sealPlan, writePublicationObjects } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { fixture } from "./manifest-fixture";
import { effectDigest, validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { readRejection } from "../../../plugins/vh-adlc/scripts/docs-drift/rejections";
import { publicationFixture } from "./publication-fixture";

// Pre-T80 serialized schemas and literal legacy response/command formats.
// Materialize native plan inputs, paths and hashes without the current rejection writer.
const processBytes = canonicalJSON({ pid: 123, exit_code: 1, timed_out: false,
  cancelled: null, output_limit: false, reaped: true });
for (const kind of ["git", "http"] as const) {
  test(`serialized pre-T80 ${kind} proof remains readable with original file integrity checks`, () => {
    const f = publicationFixture([]);
    try {
      const effects = [...f.plan.manifest.effects];
      const comment: Effect = { id: "legacy-comment", kind: "comment-create", payload: { number: 77, prior_ids: [], body: "legacy reviewed body" } };
      if (kind === "http") effects.splice(-1, 0, comment);
      const input = fixture(f.plan.manifest.bindings, effects);
      const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, adoption_sha256: f.plan.adoption_sha256,
        publication_kind: "advisory", context: "trial", transport: "native", corrections: [], attention: [] });
      const journal = createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan });
      const objects = writePublicationObjects(f.store, plan, journal.header);
      const effect = kind === "git" ? effects.at(-1)! : comment;
      const ref = f.settings.publication.lease_ref;
      const argv = kind === "git" ? nativePushArguments(f.settings.hostname, plan.manifest.repository,
        [{ ref, head: null, expected: objects.lease_object }])
        : ["gh", "api", "--hostname", f.settings.hostname, "--method", "POST", "--include", "--jq", "empty",
          `repos/${plan.manifest.repository}/issues/77/comments`];
      const id = "11111111-1111-4111-8111-111111111111";
      const directory = join(f.artifacts, "native-command-" + id);
      mkdirSync(directory, { mode: 0o700 });
      const owner = canonicalJSON({ schema_version: 1, kind: "docs-drift-native-command",
        operation_id: plan.manifest.operation_id, root: directory, effect_id: effect.id,
        attempt_id: "legacy-attempt", argv_sha256: sha256(canonicalJSON(argv)) });
      const protocol = kind === "git" ? { protocol: "git", updates: [{ ref, head: null }] } : { protocol: "http" };
      const stdout = Buffer.from(kind === "git"
        ? `To https://github.com/fixture/docs.git\n!\t:${ref}\t[rejected] (stale info)\nDone\n`
        : 'HTTP/2.0 403 Forbidden\r\n\r\n{"message":"legacy denied"}');
      const ownerPath = join(f.artifacts, id + ".native-command.json");
      const processPath = join(directory, "process.json"), stdoutPath = join(directory, "stdout");
      const proofPath = join(f.artifacts, "legacy-rejection.json");
      const proof = canonicalJSON({ schema_version: 1, state: "rejected", operation_id: plan.manifest.operation_id,
        repository: plan.manifest.repository, plan_sha256: sha256(canonicalJSON(plan)),
        effect_sha256: effectDigest([effect]), attempt_id: "legacy-attempt", command_directory: directory,
        protocol, command: { owner_sha256: sha256(owner), process_sha256: sha256(processBytes),
          stdout_sha256: sha256(stdout), observed: kind === "git" ? { protocol: "git", refs: [ref] } : { protocol: "http", status: 403 } } });
      for (const [path, bytes] of [[ownerPath, owner], [processPath, processBytes], [stdoutPath, stdout], [proofPath, proof]] as const) {
        writeFileSync(path, bytes, { mode: 0o600 });
      }
      const options = { artifact_root: f.artifacts, source_repo: f.repo, plan, effect, header: journal.header,
        attempt_id: "legacy-attempt", evidence: { path: proofPath, sha256: sha256(proof) } };
      if (kind === "http") writeFileSync(join(directory, "payload.json"), canonicalJSON({ body: comment.payload.body }), { mode: 0o600 });
      expect(readRejection(options)).toEqual(options.evidence);
      for (const path of [ownerPath, processPath, stdoutPath, proofPath, ...(kind === "http" ? [join(directory, "payload.json")] : [])]) {
        const original = readFileSync(path);
        writeFileSync(path, "{}");
        expect(() => readRejection(options)).toThrow();
        writeFileSync(path, original);
      }
      for (const extra of [{ capture: "future-format" }, { extra: true }]) {
        const changedOwner = canonicalJSON({ ...JSON.parse(owner.toString()), ...extra });
        const changedProof = JSON.parse(proof.toString());
        changedProof.command.owner_sha256 = sha256(changedOwner);
        const changedBytes = canonicalJSON(changedProof);
        writeFileSync(ownerPath, changedOwner);
        writeFileSync(proofPath, changedBytes);
        expect(() => readRejection({ ...options, evidence: { path: proofPath, sha256: sha256(changedBytes) } })).toThrow();
      }
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}
