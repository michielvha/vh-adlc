import { afterAll, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { effectDigest, manifestDigest } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { publicationFixture } from "./publication-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test.each(["matching", "missing-effect", "extra-effect", "changed-manifest", "changed-source", "report-origin", "changed-record"])("publication authority binds its actual scoped source %s", async scenario => {
  const { readPublicationAuthority } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-authority");
  const f = publicationFixture(roots), manifest = f.input.manifest;
  const requestBytes = Buffer.from("Synthetic owner request explicitly approves the presented lease, receipt, candidate push, PR payload and lease release.\n");
  writeFileSync(join(f.artifacts, "owner-request.txt"), requestBytes, { mode: 0o600 });
  const request = { schema_version: 1, kind: "docs-drift-publication-authority", manifest_sha256: manifestDigest(manifest),
    origin: { kind: "owner-request", artifact: { path: "owner-request.txt", sha256: sha256(requestBytes) } },
    effects: manifest.effects.map(effect => ({ id: effect.id, sha256: effectDigest([effect]) })) };
  if (scenario === "missing-effect") request.effects.pop();
  if (scenario === "extra-effect") request.effects.push({ id: "unrequested-issue", sha256: "0".repeat(64) });
  if (scenario === "changed-manifest") request.manifest_sha256 = "0".repeat(64);
  if (scenario === "report-origin") request.origin.kind = "generated-report";
  const bytes = canonicalJSON(request), reference = { path: "publication-authority.json", sha256: sha256(bytes) };
  writeFileSync(join(f.artifacts, reference.path), bytes, { mode: 0o600 });
  if (scenario === "changed-record") writeFileSync(join(f.artifacts, reference.path), "{}");
  if (scenario === "changed-source") writeFileSync(join(f.artifacts, "owner-request.txt"), "Different request\n");
  const options = { source_repo: f.repo, artifact_root: f.artifacts, reference, manifest };
  if (scenario === "matching") {
    const first = readPublicationAuthority(options);
    expect(first.grants).toHaveLength(manifest.effects.length); expect(first.origin).toBe("owner-attestation");
    expect(first.grants.every(grant => grant.authority_sha256 === first.authority_sha256)).toBe(true);
    const changed = Buffer.concat([requestBytes, Buffer.from("Reaffirmed in a fresh owner request.\n")]);
    writeFileSync(join(f.artifacts, "owner-request.txt"), changed, { mode: 0o600 });
    request.origin.artifact.sha256 = sha256(changed);
    const renewed = canonicalJSON(request); writeFileSync(join(f.artifacts, reference.path), renewed, { mode: 0o600 });
    const next = readPublicationAuthority({ ...options, reference: { ...reference, sha256: sha256(renewed) } });
    expect(next.authority_sha256).not.toBe(first.authority_sha256);
    expect(readFileSync(join(f.repo, "README.md"), "utf8")).toBe("Synthetic publisher fixture\n");
  } else {
    const reasons = { "missing-effect": "exact effects", "extra-effect": "exact effects", "changed-manifest": "manifest changed", "changed-source": "artifact changed", "report-origin": "actual owner request", "changed-record": "artifact changed" };
    expect(() => readPublicationAuthority(options)).toThrow(reasons[scenario as keyof typeof reasons]);
  }
});

test.each(["matching", "dirty-overlay", "missing-context", "wrong-path", "changed-procedure", "wrong-source"])("adopted procedure authority rechecks committed current policy %s", async scenario => {
  const { readPublicationAuthority } = await import("../../../plugins/vh-adlc/scripts/docs-drift/publication-authority");
  const { commitAll, put } = await import("./repository-fixture");
  const f = publicationFixture(roots), original = Buffer.from("Synthetic adopted procedure explicitly permits this exact publication scope.\n"), path = f.settings.project_procedure;
  put(f.repo, path, original.toString()); const source = commitAll(f.repo), manifest = structuredClone(f.input.manifest);
  manifest.bindings.source_commit = source;
  const request = { schema_version: 1, kind: "docs-drift-publication-authority", manifest_sha256: manifestDigest(manifest),
    origin: { kind: "adopted-procedure", commit: source, path, sha256: sha256(original) }, effects: manifest.effects.map(effect => ({ id: effect.id, sha256: effectDigest([effect]) })) };
  let current = source;
  if (scenario === "dirty-overlay") put(f.repo, path, "Preserve unrelated local procedure draft\n");
  if (scenario === "changed-procedure") { put(f.repo, path, "Changed procedure authority\n"); current = commitAll(f.repo); }
  if (scenario === "wrong-path") request.origin.path = "README.md";
  if (scenario === "wrong-source") request.origin.commit = f.input.manifest.bindings.source_commit;
  const bytes = canonicalJSON(request), reference = { path: "procedure-authority.json", sha256: sha256(bytes) };
  writeFileSync(join(f.artifacts, reference.path), bytes, { mode: 0o600 });
  const options = { source_repo: f.repo, artifact_root: f.artifacts, reference, manifest,
    adopted_procedure: scenario === "missing-context" ? undefined : { repo: f.repo, current_default: current, path } };
  if (["matching", "dirty-overlay"].includes(scenario)) {
    expect(readPublicationAuthority(options).source_kind).toBe("adopted-procedure");
    if (scenario === "dirty-overlay") expect(readFileSync(join(f.repo, path), "utf8")).toBe("Preserve unrelated local procedure draft\n");
  } else {
    const reason = scenario === "changed-procedure" ? "adopted procedure changed" : scenario === "missing-context" ? "actual owner request" : "procedure scope changed";
    expect(() => readPublicationAuthority(options)).toThrow(reason);
  }
});
