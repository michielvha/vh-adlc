import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import type { PullRequestInput, RepositoryReader } from "../github-read";
import { readGit } from "./git";
import { gitEnvironment, gitReadArguments } from "../git-read";
import { join } from "node:path";
import { executeOwnedProcess } from "./owned-process";
import { canonicalDigest, canonicalJSON, decodeUTF8, protocolPath, sha256 } from "./protocol";
import type { Settings } from "./settings";
import type { OwnedObjectStore } from "./snapshot";

export function collectProposals(reader: RepositoryReader, settings: Settings) {
  const proposals: PullRequestInput[] = [], diagnostics: string[] = [];
  try {
    const repository = reader.repository();
    if (repository.full_name.toLowerCase() !== settings.repository.toLowerCase() || repository.default_branch !== settings.default_branch) throw Error("repository identity changed");
    const open = reader.pulls(settings.default_branch);
    diagnostics.push(...open.diagnostics);
    if (!open.complete && !open.diagnostics.length) diagnostics.push("Open proposal collection incomplete");
    const selected = new Map<number, PullRequestInput>();
    for (const proposal of open.items) {
      const shared = settings.pr_discovery.authors.includes(proposal.actor) && settings.pr_discovery.branch_prefixes.some(prefix => proposal.head_ref.startsWith(prefix));
      const legacy = settings.legacy_proposals.authors.includes(proposal.actor) && settings.legacy_proposals.branch_prefixes.some(prefix => proposal.head_ref.startsWith(prefix));
      if (shared || legacy || settings.legacy_proposals.ids.includes(proposal.number)) selected.set(proposal.number, proposal);
    }
    for (const id of settings.legacy_proposals.ids) {
      if (selected.has(id)) continue;
      try {
        const proposal = reader.pull(id);
        if (proposal.base_ref !== settings.default_branch) throw Error("proposal base changed");
        selected.set(id, proposal);
      } catch { diagnostics.push(`Required proposal ${id} unavailable`); }
    }
    proposals.push(...[...selected.values()].sort((left, right) => left.number - right.number));
  } catch { diagnostics.push("Required repository or proposal collection unavailable"); }
  return { complete: diagnostics.length === 0, proposals, diagnostics, observations: reader.trace() };
}

function ownedStore(store: OwnedObjectStore, repository: string): void {
  try {
    const raw = readFileSync(store.record_path);
    const record: unknown = JSON.parse(decodeUTF8(raw));
    if (!record || typeof record !== "object" || Array.isArray(record)) throw Error("record");
    const value = record as Record<string, unknown>;
    if (sha256(raw) !== store.record_sha256 || value.kind !== "pr-object-store" || value.root !== realpathSync(store.root)
      || value.source_commit !== store.source_commit || value.repository !== repository.toLowerCase()
      || readGit(store.root, "rev-parse", "--is-bare-repository").toString().trim() !== "true") throw Error("record binding");
  } catch { throw new Error("invalid owned proposal object store"); }
}

export type ProposalFile = { path: string; status: string; before_oid: string; after_oid: string; before_mode: string; after_mode: string; before: Buffer | null; after: Buffer | null };
export type ProposalDiff = {
  complete: boolean; diagnostics: string[]; base_sha: string; head_sha: string; merge_base: string | null;
  patch_bytes: Buffer; patch_sha256: string | null; files: ProposalFile[]; inputs_sha256: string | null;
};

/** Read full immutable Git objects. REST patch fields never supply proposal content. */
export function readProposalDiff(store: OwnedObjectStore, proposal: PullRequestInput): ProposalDiff {
  ownedStore(store, proposal.base_repository.full_name);
  const result: ProposalDiff = { complete: false, diagnostics: [], base_sha: proposal.base_sha, head_sha: proposal.head_sha,
    merge_base: null, patch_bytes: Buffer.alloc(0), patch_sha256: null, files: [], inputs_sha256: null };
  try {
    for (const oid of [proposal.base_sha, proposal.head_sha]) {
      if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(oid)
        || readGit(store.root, "rev-parse", "--verify", "--end-of-options", oid + "^{commit}").toString().trim() !== oid) throw Error("missing object");
    }
    if (readGit(store.root, "rev-parse", "--is-shallow-repository").toString().trim() !== "false") throw Error("incomplete ancestry");
    if (readGit(store.root, "rev-list", "--objects", "--missing=print", proposal.base_sha, proposal.head_sha).toString().split("\n").some(line => line.startsWith("?"))) throw Error("missing proposal ancestry or tree");
    const bases = readGit(store.root, "merge-base", "--all", proposal.base_sha, proposal.head_sha).toString().trim().split("\n");
    if (bases.length !== 1 || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(bases[0])) throw Error("ambiguous merge base");
    result.merge_base = bases[0];
    const raw = readGit(store.root, "diff", "--raw", "--no-abbrev", "--no-renames", "--no-ext-diff", "--no-textconv", "-z", bases[0], proposal.head_sha, "--");
    const fields = raw.toString("binary").split("\0");
    if (fields.pop() !== "") throw Error("unterminated diff");
    for (let index = 0; index < fields.length; index += 2) {
      const match = /^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]{40}(?:[a-f0-9]{24})?) ([a-f0-9]{40}(?:[a-f0-9]{24})?) ([AMDT])$/u.exec(fields[index]);
      if (!match || fields[index + 1] === undefined) throw Error("incomplete raw diff");
      const path = protocolPath(decodeUTF8(Buffer.from(fields[index + 1], "binary")));
      const [, beforeMode, afterMode, beforeOID, afterOID, status] = match;
      const blob = (mode: string, oid: string): Buffer | null => {
        if (mode === "000000") return null;
        if (!["100644", "100755"].includes(mode)) throw Error("nonregular proposal entry");
        return readGit(store.root, "cat-file", "blob", oid);
      };
      result.files.push({ path, status, before_oid: beforeOID, after_oid: afterOID, before_mode: beforeMode, after_mode: afterMode,
        before: blob(beforeMode, beforeOID), after: blob(afterMode, afterOID) });
    }
    result.patch_bytes = readGit(store.root, "diff", "--binary", "--full-index", "--no-renames", "--no-ext-diff", "--no-textconv", bases[0], proposal.head_sha, "--");
    if (result.patch_bytes.length > 64 * 1024 * 1024) throw Error("proposal diff bound");
    result.patch_sha256 = sha256(result.patch_bytes);
    result.inputs_sha256 = canonicalDigest({ base: proposal.base_sha, head: proposal.head_sha, merge_base: bases[0], patch_sha256: result.patch_sha256,
      files: result.files.map(file => ({ path: file.path, before: file.before === null ? null : sha256(file.before), after: file.after === null ? null : sha256(file.after), before_mode: file.before_mode, after_mode: file.after_mode })) });
    result.complete = true;
  } catch { result.diagnostics.push("Required complete proposal Git objects or ancestry unavailable"); }
  return result;
}

export type ProposalFetchOptions = {
  hostname: string; repository: string; default_branch: string;
  environment: Readonly<Record<string, string | undefined>>; timeout_ms?: number;
};

/** Authenticated reads are confined to fixed PR/default refs in the already recorded owned store. */
export async function fetchProposalObjects(store: OwnedObjectStore, proposal: PullRequestInput, options: ProposalFetchOptions): Promise<ProposalDiff> {
  ownedStore(store, options.repository);
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(options.hostname)
    || !/^[a-z0-9-]+\/[a-z0-9_.-]+$/iu.test(options.repository)
    || proposal.base_repository.full_name.toLowerCase() !== options.repository.toLowerCase()
    || !Number.isSafeInteger(proposal.number) || proposal.number < 1
    || proposal.base_ref !== options.default_branch) throw new Error("invalid owned proposal fetch target");
  readGit(store.root, "check-ref-format", "--branch", options.default_branch);
  const environment = {
    PATH: options.environment.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME,
    GH_CONFIG_DIR: options.environment.GH_CONFIG_DIR, GH_HOST: options.hostname,
    GH_TOKEN: options.environment.GH_TOKEN, GITHUB_TOKEN: options.environment.GITHUB_TOKEN,
    GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1",
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  };
  try {
    const args = gitReadArguments(["--no-lazy-fetch", "--no-replace-objects", "-c", "core.hooksPath=/dev/null", "-c", "gc.auto=0",
      "-c", "fetch.writeCommitGraph=false", "-c", "http.extraHeader=", "-c", "credential.helper=",
      "-c", "credential.helper=!gh auth git-credential", "-c", "http.followRedirects=false", "-c", "http.sslVerify=true", "-c", "protocol.file.allow=never",
      "fetch", "--no-tags", "--no-write-fetch-head", "--no-recurse-submodules", "--no-auto-maintenance", "--",
      `https://${options.hostname}/${options.repository}.git`,
      `+refs/heads/${options.default_branch}:refs/docs-drift/inputs/default`, `+refs/pull/${proposal.number}/head:refs/docs-drift/inputs/pr-${proposal.number}`,
    ]);
    const root = mkdtempSync(join(store.root, "docs-drift-fetch-"));
    writeFileSync(join(root, "intent.json"), canonicalJSON({ repository: options.repository, base_sha: proposal.base_sha, head_sha: proposal.head_sha, argv: args }), { flag: "wx", mode: 0o600 });
    const env = Object.fromEntries(Object.entries(gitEnvironment(environment)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    const execution = await executeOwnedProcess({ argv: args, cwd: store.root, env, watched_outputs: [],
      stdout: join(root, "stdout"), stderr: join(root, "stderr"), timeout_ms: options.timeout_ms ?? 60000,
      started: pid => writeFileSync(join(root, "process-start.json"), canonicalJSON({ pid }), { flag: "wx", mode: 0o600 }) });
    writeFileSync(join(root, "process-result.json"), canonicalJSON(execution), { flag: "wx", mode: 0o600 });
    if (execution.exit_code !== 0 || !execution.reaped || execution.timed_out || execution.cancelled || execution.output_limit) throw Error("incomplete fetch process");
    const head = readGit(store.root, "rev-parse", "--verify", `refs/docs-drift/inputs/pr-${proposal.number}^{commit}`).toString().trim();
    const base = readGit(store.root, "rev-parse", "--verify", "refs/docs-drift/inputs/default^{commit}").toString().trim();
    if (head !== proposal.head_sha || base !== proposal.base_sha) throw Error("proposal changed during fetch");
    return readProposalDiff(store, proposal);
  } catch {
    return { complete: false, diagnostics: ["Fixed-ref proposal fetch unavailable or source changed"], base_sha: proposal.base_sha,
      head_sha: proposal.head_sha, merge_base: null, patch_bytes: Buffer.alloc(0), patch_sha256: null, files: [], inputs_sha256: null };
  }
}
