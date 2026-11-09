/** Owned native read fixture with real local Git objects and synthetic GitHub responses. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PullRequestInput } from "../../../plugins/vh-adlc/scripts/github-read";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { closureFixture } from "./closure-fixture";
import { commitAll, git, put } from "./repository-fixture";

function nativePull(proposal: PullRequestInput) {
  return { number: proposal.number, state: proposal.state, merged_at: proposal.merged_at, body: proposal.body, draft: proposal.draft,
    user: { login: proposal.actor, id: proposal.actor_id, type: proposal.actor_type },
    head: { sha: proposal.head_sha, ref: proposal.head_ref, repo: proposal.head_repository },
    base: { sha: proposal.base_sha, ref: proposal.base_ref, repo: proposal.base_repository } };
}

export async function nativeClosureFixture(roots: string[], method: "merge" | "squash" | "rebase", fault = "none", adoptedRepo?: string, configure?: Parameters<typeof closureFixture>[3]) {
  const f = await closureFixture(roots, method, false, configure ?? (fault === "required-input" ? selected => ({ ...selected.options,
    collection: { ...selected.collection, snapshot: { ...selected.snapshot,
      required_inputs: [{ id: "current-date", kind: "time", sha256: sha256(Buffer.from("synthetic recorded date")) }] } } }) : undefined), adoptedRepo), artifacts = dirname(f.collection.store.record_path), bin = join(artifacts, "native-bin");
  mkdirSync(bin, { mode: 0o700 });
  if (fault === "oversized-target") {
    const path = join(f.repo, ".vh-adlc/docs-drift.yaml"), settings = JSON.parse(readFileSync(path, "utf8"));
    settings.reports.max_entry_bytes = f.recordBytes.length + 100;
    put(f.repo, ".vh-adlc/docs-drift.yaml", JSON.stringify(settings));
  }
  put(f.repo, "later-unrelated.txt", "Later default commit\n"); const source = commitAll(f.repo);
  git(f.repo, "update-ref", "refs/pull/20/head", f.head);
  for (const proposal of f.proposals.values()) git(f.repo, "update-ref", "refs/pull/" + proposal.number + "/head", proposal.head_sha);
  if (fault === "missing-original-ref") git(f.repo, "update-ref", "-d", "refs/pull/1/head");
  const original = f.proposals.get(1); if (!original) throw Error("missing fixture original");
  const repository = original.base_repository;
  const merged = fault !== "unmerged" && fault !== "open";
  const consolidation = { ...nativePull(f.consolidation), merged, merge_commit_sha: merged ? f.merged : null,
    merged_at: merged ? f.consolidation.merged_at : null, state: fault === "open" ? "open" : "closed" };
  const proposal = { ...nativePull(original), body: fault === "changed-original" ? "Changed original body" : original.body };
  const responses = { "repos/fixture/docs": repository,
    "repos/fixture/docs/git/ref/heads/main": { ref: "refs/heads/main", object: { type: "commit", sha: source } },
    ["repos/fixture/docs/git/commits/" + source]: { sha: source, tree: { sha: "a".repeat(40) }, parents: [], message: "Fixture" },
    "repos/fixture/docs/pulls/20": consolidation, "repos/fixture/docs/pulls/1": proposal,
    "repos/fixture/docs/issues/1/comments?per_page=100&page=1": fault === "missing-comments" ? null : [] };
  const calls = join(artifacts, "native-closure-calls.jsonl");
  const realGit = Bun.which("git"); if (!realGit) throw Error("fixture requires Git");
  writeFileSync(join(bin, "git"), `#!${process.execPath}
const args = process.argv.slice(2), target = args.indexOf("https://github.com/fixture/docs.git");
require("node:fs").appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ program: "git", args }) + "\\n", { mode: 0o600 });
if (target >= 0) { args[target] = ${JSON.stringify(f.repo)}; args.splice(args.indexOf("fetch"), 0, "-c", "protocol.file.allow=always"); }
const child = Bun.spawnSync([${JSON.stringify(realGit)}, ...args], { stdout: "inherit", stderr: "inherit" }); process.exit(child.exitCode);
`, { mode: 0o700 });
  writeFileSync(join(bin, "gh"), `#!${process.execPath}
const args = process.argv.slice(2);
require("node:fs").appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ program: "gh", args }) + "\\n", { mode: 0o600 });
if (args.includes("graphql")) {
  const reads = require("node:fs").readFileSync(${JSON.stringify(calls)}, "utf8").trim().split("\\n").map(line => JSON.parse(line));
  const changed = ${JSON.stringify(fault === "changed-actor")} && reads.filter(call => call.program === "gh" && call.args.includes("graphql")).length >= 6;
  console.log(JSON.stringify({ data: { viewer: { login: changed ? "other-fixture-actor" : "fixture-bot", databaseId: changed ? 21 : 20 } } })); process.exit(0);
}
if (args[args.indexOf("--method") + 1] !== "GET") process.exit(91);
const values = ${JSON.stringify(responses)}, value = values[args.at(-1)];
if (!value) { console.log("HTTP/2.0 404 Not Found\\r\\n\\r\\n{}"); process.exit(1); }
console.log("HTTP/2.0 200 OK\\r\\n\\r\\n" + JSON.stringify(value));
`, { mode: 0o700 });
  const selection = canonicalJSON({ schema_version: 1, source_commit: source, consolidation: 20 });
  writeFileSync(join(artifacts, "closure-selection.json"), selection, { mode: 0o600 });
  return { ...f, source, artifacts, selection, calls, environment: { ...process.env, PATH: bin + ":" + process.env.PATH, GH_TOKEN: "synthetic-read-token" } };
}
