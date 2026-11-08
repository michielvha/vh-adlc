import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { collectTrialBindings } from "./adoption";
import { readAdoptionInput, readGit } from "./git";
import { publishArtifact } from "./journal";
import { canonicalJSON, compareUTF8, freezeJSON, sha256 } from "./protocol";
import { externalArtifactDirectory, readCommittedTree } from "./snapshot";
import type { PublicationIdentity } from "./transport";

function fail(reason: string): never { throw Error("docs-drift trial setup " + reason); }

/** Import only the committed synthetic bundle into a new owned directory. This grants no execution. */
export function prepareTrialFixture(options: {
  repo: string; current_default: string; identity: PublicationIdentity; directory: string;
}) {
  const policy = collectTrialBindings({ repo: options.repo, current_default: options.current_default, identity: options.identity });
  const parent = externalArtifactDirectory(options.directory, options.repo);
  const bundle = readAdoptionInput(options.repo, options.current_default, policy.fixture.bundle.path);
  if (!bundle || bundle.sha256 !== policy.fixture.bundle.sha256) fail("committed bundle changed");
  const root = mkdtempSync(join(parent, "docs-drift-trial-")); chmodSync(root, 0o700);
  const source = join(root, "source"), bundlePath = join(root, "fixture.bundle");
  let phase = "initialize";
  try {
    mkdirSync(source, { mode: 0o700 });
    writeFileSync(bundlePath, bundle.bytes, { flag: "wx", mode: 0o600 });
    readGit(source, "init", "--template=", "-b", "fixture");
    readGit(source, "config", "gc.auto", "0"); readGit(source, "config", "maintenance.auto", "false");
    phase = "verify-bundle";
    readGit(source, "bundle", "verify", bundlePath);
    phase = "bundle-head";
    const heads = readGit(source, "bundle", "list-heads", bundlePath).toString().trim();
    if (heads !== policy.fixture.source_commit + " HEAD") fail("fixture bundle head");
    phase = "import-bundle";
    readGit(source, "bundle", "unbundle", bundlePath);
    phase = "fixture-tree";
    const tree = readGit(source, "rev-parse", "--verify", "--end-of-options", policy.fixture.source_commit + "^{tree}").toString().trim();
    if (tree !== policy.fixture.tree) fail("fixture tree");
    phase = "fixture-manifest";
    const files = readCommittedTree(source, policy.fixture.source_commit);
    const actual = files.map(row => [row.path, row.mode, sha256(row.bytes)]).sort(([a], [b]) => compareUTF8(a, b));
    const expected = policy.fixture.files.map(row => [row.target, row.mode, row.sha256]).sort(([a], [b]) => compareUTF8(a, b));
    if (!canonicalJSON(actual).equals(canonicalJSON(expected))) fail("fixture manifest differs from bundled tree");
    phase = "materialize";
    for (const file of files) {
      if ((file.mode !== "100644" && file.mode !== "100755") || file.path.split("/").some(part => part.toLowerCase() === ".git")) fail("fixture file mode or path");
      const path = join(source, file.path);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, file.bytes, { flag: "wx", mode: file.mode === "100755" ? 0o700 : 0o600 });
      chmodSync(path, file.mode === "100755" ? 0o700 : 0o600);
    }
    readGit(source, "update-ref", "refs/heads/fixture", policy.fixture.source_commit);
    readGit(source, "read-tree", policy.fixture.source_commit);
    if (readGit(source, "status", "--porcelain").length) fail("fixture materialization changed");
    phase = "finalize";
    const result = freezeJSON({ schema_version: 1, kind: "docs-drift-trial-fixture", authority: "none", root, source,
      current_default: policy.source_commit, definition_sha256: policy.definition_sha256,
      candidate_protected_sha256: policy.candidate.protected_sha256,
      fixture: { id: policy.fixture.id, source_commit: policy.fixture.source_commit, tree, bundle_sha256: bundle.sha256 } });
    publishArtifact(join(root, "preparation.json"), canonicalJSON(result));
    return result;
  } catch (error) {
    const reason = (error instanceof Error ? error.message : "unknown setup failure").slice(0, 2048);
    try {
      publishArtifact(join(root, "setup-failed.json"), canonicalJSON({ schema_version: 1, kind: "docs-drift-trial-setup-failure",
        authority: "none", phase, reason, fixture_id: policy.fixture.id, bundle_sha256: bundle.sha256,
        current_default: policy.source_commit, definition_sha256: policy.definition_sha256 }));
    } catch (recordingError) {
      throw new AggregateError([error, recordingError], reason + ". Trial setup failure evidence unavailable", { cause: error });
    }
    throw error;
  }
}
