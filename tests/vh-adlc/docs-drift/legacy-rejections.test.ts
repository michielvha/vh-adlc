import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { effectDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { readRejection } from "../../../plugins/vh-adlc/scripts/docs-drift/rejections";
import { publicationFixture } from "./publication-fixture";

// Frozen pre-T80 schemas. Only runtime paths and their dependent digests are materialized.
// These fixtures never call the current rejection writer.
const processBytes = canonicalJSON({ pid: 123, exit_code: 1, timed_out: false,
  cancelled: null, output_limit: false, reaped: true });
for (const kind of ["git", "http"] as const) {
  test(`serialized pre-T80 ${kind} proof remains readable with original file integrity checks`, () => {
    const f = publicationFixture([]);
    try {
      const effect = f.plan.manifest.effects[0];
      const id = "11111111-1111-4111-8111-111111111111";
      const directory = join(f.artifacts, "native-command-" + id);
      mkdirSync(directory, { mode: 0o700 });
      const owner = canonicalJSON({ schema_version: 1, kind: "docs-drift-native-command",
        operation_id: f.plan.manifest.operation_id, root: directory, effect_id: effect.id,
        attempt_id: "legacy-attempt", argv_sha256: "a".repeat(64) });
      const ref = f.settings.publication.lease_ref;
      const protocol = kind === "git" ? { protocol: "git", updates: [{ ref, head: null }] } : { protocol: "http" };
      const stdout = Buffer.from(kind === "git"
        ? `To https://github.com/fixture/docs.git\n!\t:${ref}\t[rejected] (stale info)\nDone\n`
        : 'HTTP/2.0 403 Forbidden\r\n\r\n{"message":"legacy denied"}');
      const ownerPath = join(f.artifacts, id + ".native-command.json");
      const processPath = join(directory, "process.json"), stdoutPath = join(directory, "stdout");
      const proofPath = join(f.artifacts, "legacy-rejection.json");
      const proof = canonicalJSON({ schema_version: 1, state: "rejected", operation_id: f.plan.manifest.operation_id,
        repository: f.plan.manifest.repository, plan_sha256: sha256(canonicalJSON(f.plan)),
        effect_sha256: effectDigest([effect]), attempt_id: "legacy-attempt", command_directory: directory,
        protocol, command: { owner_sha256: sha256(owner), process_sha256: sha256(processBytes),
          stdout_sha256: sha256(stdout), observed: kind === "git" ? { protocol: "git", refs: [ref] } : { protocol: "http", status: 403 } } });
      for (const [path, bytes] of [[ownerPath, owner], [processPath, processBytes], [stdoutPath, stdout], [proofPath, proof]] as const) {
        writeFileSync(path, bytes, { mode: 0o600 });
      }
      const options = { artifact_root: f.artifacts, source_repo: f.repo, plan: f.plan, effect,
        attempt_id: "legacy-attempt", evidence: { path: proofPath, sha256: sha256(proof) } };
      expect(readRejection(options)).toEqual(options.evidence);
      for (const path of [ownerPath, processPath, stdoutPath, proofPath]) {
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
