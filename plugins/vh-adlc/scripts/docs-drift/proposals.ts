import { lstatSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import type { PublicationPullInput, PullRequestInput, RepositoryReader } from "../github-read";
import { readGit } from "./git";
import { gitEnvironment, gitReadArguments } from "../git-read";
import { join } from "node:path";
import { executeOwnedProcess, ownedClientCompleted } from "./owned-process";
import { canonicalDigest, canonicalJSON, decodeUTF8, protocolPath, sha256 } from "./protocol";
import type { Settings } from "./settings";
import { sameAccount, sameLogin } from "./identity";
import type { OwnedObjectStore } from "./snapshot";

/** Refreshing a configured legacy target preserves its author. The executing actor stays separate. */
export function isRefreshTarget(settings: Settings, identity: { actor: string; actor_id: number; repository_id: number },
  target: { number: number; actor: string; actor_id: number; head_ref: string; head_repository_id: number | null }): boolean {
  const shared = sameAccount(target, identity)
    && target.head_ref.startsWith(settings.publication.branch_prefix);
  const legacy = settings.legacy_proposals.authors.some(author => sameLogin(author, target.actor))
    && settings.legacy_proposals.branch_prefixes.some(prefix => target.head_ref.startsWith(prefix));
  return target.head_repository_id === identity.repository_id && (shared || legacy);
}

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
      const shared = settings.pr_discovery.authors.some(author => sameLogin(author, proposal.actor)) && settings.pr_discovery.branch_prefixes.some(prefix => proposal.head_ref.startsWith(prefix));
      const legacy = settings.legacy_proposals.authors.some(author => sameLogin(author, proposal.actor)) && settings.legacy_proposals.branch_prefixes.some(prefix => proposal.head_ref.startsWith(prefix));
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

/** Publication additionally binds mutable titles and labels before either role is launched. */
export function collectPublicationProposals(reader: RepositoryReader, settings: Settings) {
  const inventory = collectProposals(reader, settings), proposals: PublicationPullInput[] = [], diagnostics = [...inventory.diagnostics];
  let scope_changed = false;
  for (const original of inventory.proposals) {
    try {
      const proposal = reader.publicationPull(original.number), { title: _title, labels: _labels, ...core } = proposal;
      if (!canonicalJSON(core).equals(canonicalJSON(original))) { scope_changed = true; throw Error("Proposal changed during full metadata collection"); }
      proposals.push(proposal);
    } catch { diagnostics.push(`Required full proposal metadata ${original.number} unavailable or changed`); }
  }
  return { complete: inventory.complete && diagnostics.length === 0, scope_changed, proposals, diagnostics, observations: reader.trace() };
}

/** Keep an exact metadata preimage for replay checks while retaining only body digests. */
export function projectProposalBindings(inventory: PullRequestInput[], resolutionSHA: string | null) {
  return { schema_version: 1 as const, kind: "docs-drift-proposal-snapshot" as const,
    inventory: inventory.map(({ body, ...proposal }) => ({ ...proposal, body_sha256: sha256(Buffer.from(body)) })),
    resolution_sha256: resolutionSHA };
}

export function requireOwnedStore(store: OwnedObjectStore, repository: string): void {
  try {
    const file = lstatSync(store.record_path), directory = lstatSync(store.root);
    if (!file.isFile() || file.isSymbolicLink() || !directory.isDirectory() || directory.isSymbolicLink()
      || (file.mode & 0o077) !== 0 || (directory.mode & 0o077) !== 0 || realpathSync(store.root) !== store.root
      || (process.getuid && (file.uid !== process.getuid() || directory.uid !== process.getuid()))) throw Error("private owned store");
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
  requireOwnedStore(store, proposal.base_repository.full_name);
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
  hostname: string; repository: string; default_branch: string; expected_default_commit?: string;
  environment: Readonly<Record<string, string | undefined>>; timeout_ms?: number;
};

function validateFetchTarget(store: OwnedObjectStore, options: ProposalFetchOptions): void {
  requireOwnedStore(store, options.repository);
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(options.hostname)
    || !/^[a-z0-9-]+\/[a-z0-9_.-]+$/iu.test(options.repository)) throw Error("invalid owned proposal fetch target");
  readGit(store.root, "check-ref-format", "--branch", options.default_branch);
}

async function fetchFixedRefs(store: OwnedObjectStore, options: ProposalFetchOptions, refs: string[], scope: Record<string, string>) {
  const environment = {
    PATH: options.environment.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME,
    GH_CONFIG_DIR: options.environment.GH_CONFIG_DIR, GH_HOST: options.hostname,
    GH_TOKEN: options.environment.GH_TOKEN, GITHUB_TOKEN: options.environment.GITHUB_TOKEN,
    GH_ENTERPRISE_TOKEN: options.environment.GH_ENTERPRISE_TOKEN,
    GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1",
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  };
  const args = gitReadArguments(["--no-lazy-fetch", "--no-replace-objects", "-c", "core.hooksPath=/dev/null", "-c", "gc.auto=0",
    "-c", "fetch.writeCommitGraph=false", "-c", "http.extraHeader=", "-c", "credential.helper=",
    "-c", "credential.helper=!gh auth git-credential", "-c", "http.followRedirects=false", "-c", "http.sslVerify=true", "-c", "protocol.file.allow=never",
    "fetch", "--no-tags", "--no-write-fetch-head", "--no-recurse-submodules", "--no-auto-maintenance", "--",
    `https://${options.hostname}/${options.repository}.git`, ...refs]);
  const root = mkdtempSync(join(store.root, "docs-drift-fetch-"));
  writeFileSync(join(root, "intent.json"), canonicalJSON({ repository: options.repository, ...scope, argv: args }), { flag: "wx", mode: 0o600 });
  const stdout = join(root, "stdout"), stderr = join(root, "stderr");
  for (const path of [stdout, stderr]) writeFileSync(path, "", { flag: "wx", mode: 0o600 });
  const env = Object.fromEntries(Object.entries(gitEnvironment(environment)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const execution = await executeOwnedProcess({ argv: args, cwd: store.root, env, watched_outputs: [], stdout, stderr,
    timeout_ms: options.timeout_ms ?? 60000,
    started: pid => writeFileSync(join(root, "process-start.json"), canonicalJSON({ pid }), { flag: "wx", mode: 0o600 }) });
  writeFileSync(join(root, "process-result.json"), canonicalJSON(execution), { flag: "wx", mode: 0o600 });
  if (!ownedClientCompleted(execution)) throw Error("incomplete fetch process");
  return root;
}

/** Authenticated reads are confined to fixed PR/default refs in the already recorded owned store. */
export async function fetchProposalObjects(inputStore: OwnedObjectStore, inputProposal: PullRequestInput, inputOptions: ProposalFetchOptions): Promise<ProposalDiff> {
  const store = { ...inputStore }, proposal = structuredClone(inputProposal), options = { ...inputOptions, environment: { ...inputOptions.environment } };
  validateFetchTarget(store, options);
  if (proposal.base_repository.full_name.toLowerCase() !== options.repository.toLowerCase()
    || !Number.isSafeInteger(proposal.number) || proposal.number < 1 || proposal.base_ref !== options.default_branch)
    throw Error("invalid owned proposal fetch target");
  const expectedDefault = options.expected_default_commit ?? proposal.base_sha;
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(expectedDefault)) throw Error("invalid observed default commit");
  try {
    await fetchFixedRefs(store, options, [`+refs/heads/${options.default_branch}:refs/docs-drift/inputs/default`,
      `+refs/pull/${proposal.number}/head:refs/docs-drift/inputs/pr-${proposal.number}`], { base_sha: proposal.base_sha, head_sha: proposal.head_sha });
    const head = readGit(store.root, "rev-parse", "--verify", `refs/docs-drift/inputs/pr-${proposal.number}^{commit}`).toString().trim();
    const base = readGit(store.root, "rev-parse", "--verify", "refs/docs-drift/inputs/default^{commit}").toString().trim();
    if (head !== proposal.head_sha || base !== expectedDefault) throw Error("proposal changed during fetch");
    readGit(store.root, "merge-base", "--is-ancestor", proposal.base_sha, expectedDefault);
    return readProposalDiff(store, proposal);
  } catch {
    return { complete: false, diagnostics: ["Fixed-ref proposal fetch unavailable or source changed"], base_sha: proposal.base_sha,
      head_sha: proposal.head_sha, merge_base: null, patch_bytes: Buffer.alloc(0), patch_sha256: null, files: [], inputs_sha256: null };
  }
}

/** Observe the selected native default only in its recorded external object store. */
export async function fetchCurrentDefault(inputStore: OwnedObjectStore, inputOptions: ProposalFetchOptions & { expected_default_commit: string }) {
  const store = { ...inputStore }, options = { ...inputOptions, environment: { ...inputOptions.environment } };
  validateFetchTarget(store, options);
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(options.expected_default_commit)) throw Error("invalid observed default commit");
  const result = { complete: false, diagnostics: [] as string[], commit: null as string | null, artifact_directory: null as string | null };
  try {
    result.artifact_directory = await fetchFixedRefs(store, options, [`+refs/heads/${options.default_branch}:refs/docs-drift/inputs/default`],
      { default_sha: options.expected_default_commit });
    result.commit = readGit(store.root, "rev-parse", "--verify", "refs/docs-drift/inputs/default^{commit}").toString().trim();
    if (result.commit !== options.expected_default_commit) throw Error("default changed during fetch");
    result.complete = true;
  } catch { result.diagnostics.push("Fixed-ref default fetch unavailable or source changed"); }
  return result;
}
