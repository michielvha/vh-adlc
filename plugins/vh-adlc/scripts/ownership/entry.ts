import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OID, OwnershipGit, POLICY, REF, STATE, type Environment, type RemoteTip } from "./git";
import { associate, privateDraft, validAlias, validHost, validLocator, verifyDestination, writer, type Item, type Writer } from "./identity";

export type RecordState = { aliases: string[]; writer: Writer; operation: string; previous?: string; pending?: string; conflict?: string };
export type State = { schema_version: 1; repository: string; operation: string; items: RecordState[] };
export type Binding = { repository: string; genesis: string };
export type EntryRequest = Item & { repo: string; env?: Environment; client?: string; noPush?: boolean; localDraft?: boolean; explicitClient?: boolean; defaultBranch?: string };
export type Result = { status: "held" | "entered" | "legacy" | "local-draft" | "initialized" | "reserved" | "vacant" | "transferred" | "pending" | "linked" | "conflict"; reason?: string; writer?: Writer; item?: string; operation?: string; genesis?: string; tip?: string; localPath?: string; pending?: string; conflict?: string; preview?: string };
export type Snapshot = { tip: RemoteTip & { reservation: string }; state: State; binding: Binding };
export const OPERATION = /^[a-zA-Z0-9_-]{1,128}$/;
const CHECKOUT = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("invalid reservation data");
  return value as Record<string, unknown>;
}

function exactKeys(data: Record<string, unknown>, names: string[]) {
  if (Object.keys(data).length !== names.length || names.some(name => !Object.hasOwn(data, name))) throw Error("invalid reservation data fields");
}

function checkedBinding(raw: string): Binding {
  let value: unknown;
  try { value = Bun.YAML.parse(raw); } catch { throw Error("invalid committed reservation policy"); }
  const data = object(value);
  exactKeys(data, ["schema_version", "repository", "genesis"]);
  if (data.schema_version !== 1 || typeof data.repository !== "string" || typeof data.genesis !== "string" || !OID.test(data.genesis)) {
    throw Error("invalid committed reservation policy");
  }
  return { repository: data.repository, genesis: data.genesis };
}

function checkedWriter(value: unknown): Writer {
  const data = object(value);
  exactKeys(data, ["fingerprint", "host", "locator", "checkout"]);
  if (typeof data.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(data.fingerprint) ||
      typeof data.host !== "string" || !validHost(data.host) || typeof data.locator !== "string" || !validLocator(data.locator) ||
      typeof data.checkout !== "string" || !CHECKOUT.test(data.checkout)) {
    throw Error("invalid writer record");
  }
  return { fingerprint: data.fingerprint, host: data.host, locator: data.locator, checkout: data.checkout };
}

export function decodeState(raw: string, repository: string): State {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw Error("invalid reservation history"); }
  const data = object(value);
  exactKeys(data, ["schema_version", "repository", "operation", "items"]);
  if (data.schema_version !== 1 || data.repository !== repository || typeof data.operation !== "string" || !OPERATION.test(data.operation) || !Array.isArray(data.items)) {
    throw Error("invalid reservation history");
  }
  const aliases = new Set<string>();
  const items = data.items.map(value => {
    const record = object(value);
    const optional = ["previous", "pending", "conflict"].filter(key => Object.hasOwn(record, key));
    exactKeys(record, ["aliases", "writer", "operation", ...optional]);
    if (!Array.isArray(record.aliases) || !record.aliases.length || typeof record.operation !== "string" || !OPERATION.test(record.operation) ||
        (record.previous !== undefined && (typeof record.previous !== "string" || !OPERATION.test(record.previous))) ||
        (record.pending !== undefined && (typeof record.pending !== "string" || !/^[a-f0-9]{64}$/.test(record.pending))) ||
        (record.conflict !== undefined && (typeof record.conflict !== "string" || !OPERATION.test(record.conflict)))) {
      throw Error("invalid reservation item");
    }
    const names = record.aliases.map(alias => {
      if (typeof alias !== "string" || !validAlias(alias) || aliases.has(alias)) throw Error("invalid or conflicting reservation aliases");
      aliases.add(alias);
      return alias;
    });
    return { aliases: names, writer: checkedWriter(record.writer), operation: record.operation,
      ...(typeof record.previous === "string" ? { previous: record.previous } : {}),
      ...(typeof record.pending === "string" ? { pending: record.pending } : {}),
      ...(typeof record.conflict === "string" ? { conflict: record.conflict } : {}) };
  });
  return { schema_version: 1, repository, operation: data.operation, items };
}

const BINDING_KEY = "vh-adlc.ownershipBinding";

function bound(git: OwnershipGit): string | undefined {
  return git.config(BINDING_KEY);
}

function checkedOutPolicy(git: OwnershipGit): boolean {
  const head = git.lookup("HEAD");
  const saved = git.lookup("refs/remotes/origin/HEAD");
  return [head, saved].some(ref => ref !== undefined && git.file(ref, POLICY) !== undefined);
}

function stateAt(git: OwnershipGit, oid: string, repository: string): State {
  const raw = git.file(oid, STATE);
  if (!raw) throw Error("reservation commit has no state");
  return decodeState(raw, repository);
}

export function snapshot(git: OwnershipGit, remember = true): Snapshot | "legacy" | "no-remote" {
  const prior = bound(git);
  const remotes = git.remotes();
  if (!remotes.includes("origin")) {
    if (prior || remotes.length || checkedOutPolicy(git)) throw Error("canonical origin is missing");
    return "no-remote";
  }
  const tip = git.remote();
  git.objects(tip.main);
  const raw = git.file(tip.main, POLICY);
  if (raw === undefined && !tip.reservation && !prior && !checkedOutPolicy(git)) return "legacy";
  if (!raw || !tip.reservation) throw Error("reservation policy or established remote history is missing; verify or restore the original adoption");
  const binding = checkedBinding(raw);
  if (binding.repository !== verifyDestination(git)) throw Error("origin does not match the adopted reservation repository");
  const marker = `${binding.repository} ${binding.genesis}`;
  if (prior && prior !== marker) throw Error("reservation policy differs from the previously verified adoption");
  git.objects(tip.reservation);
  if (!git.ok("merge-base", "--is-ancestor", binding.genesis, tip.reservation)) throw Error("reservation history does not descend from the bound genesis");
  const genesis = stateAt(git, binding.genesis, binding.repository);
  if (genesis.items.length || git.text("show", "-s", "--format=%P", binding.genesis)) throw Error("invalid reservation genesis");
  const state = stateAt(git, tip.reservation, binding.repository);
  if (!prior && remember) git.run(["config", "--local", BINDING_KEY, marker]);
  return { tip: { ...tip, reservation: tip.reservation }, state, binding };
}

export function initialize(repo: string, approved: boolean, operation: string, env?: Environment): Result {
  if (!approved || !OPERATION.test(operation)) return { status: "held", reason: "explicit reservation setup approval and a stable operation ID are required" };
  const git = new OwnershipGit(repo, env);
  const repository = verifyDestination(git);
  const before = git.remote();
  git.objects(before.main);
  if (bound(git) || git.file(before.main, POLICY) !== undefined) {
    return { status: "held", reason: "repository is already bound to a reservation history; restore it instead" };
  }
  const initial: State = { schema_version: 1, repository, operation, items: [] };
  if (!before.reservation) git.install("", git.commit(JSON.stringify(initial)));
  const after = git.remote();
  if (after.reservation) {
    git.objects(after.reservation);
    const found = stateAt(git, after.reservation, repository);
    if (found.operation === operation && !found.items.length && !git.text("show", "-s", "--format=%P", after.reservation)) {
      return { status: "initialized", genesis: after.reservation, operation };
    }
  }
  return { status: "held", reason: "initialization did not verify the exact genesis and operation; inspect the canonical ref" };
}

export function matching(state: State, aliases: string[]): RecordState[] {
  return state.items.filter(record => record.aliases.some(alias => aliases.includes(alias)));
}

export function publish(git: OwnershipGit, view: Snapshot, state: State): boolean {
  return git.install(view.tip.reservation, git.commit(JSON.stringify(state), view.tip.reservation));
}

function localCheckout(git: OwnershipGit, create: boolean): string | undefined {
  const path = join(git.text("rev-parse", "--absolute-git-dir"), "vh-adlc-reservation-checkout");
  try {
    const value = readFileSync(path, "utf8").trim();
    if (!CHECKOUT.test(value)) throw Error("invalid local work location binding");
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (!create) return undefined;
  }
  try { writeFileSync(path, `${randomUUID()}\n`, { flag: "wx", mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  return localCheckout(git, false);
}

export function currentWriter(git: OwnershipGit, env: Environment, locator: string, client?: string): Writer {
  const identity = writer(env, locator, client);
  const checkout = localCheckout(git, true);
  if (!checkout) throw Error("could not bind this checkout as the work location");
  return { ...identity, checkout };
}

export function describeRecord(git: OwnershipGit, record: RecordState, status: Result["status"], tip?: string): Result {
  const localPath = localCheckout(git, false) === record.writer.checkout ? git.root : undefined;
  return { status, writer: record.writer, item: record.aliases[0], operation: record.operation, tip, localPath,
    pending: record.pending, conflict: record.conflict };
}

export function enter(request: EntryRequest): Result {
  try {
    const git = new OwnershipGit(request.repo, request.env);
    const operation = randomUUID();
    let pending: RecordState | undefined;
    let prior: RecordState | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      const view = snapshot(git);
      if (typeof view === "string") {
        if (pending) throw Error("reservation disappeared after attempting an update");
        if (view === "legacy") return { status: "legacy" };
        if (request.localDraft && request.spec && !request.issue && !request.branch) {
          privateDraft(git, request.spec);
          return { status: "local-draft" };
        }
        throw Error("no origin; only an explicitly authorized new private draft can proceed without a remote");
      }
      if (request.explicitClient && !request.client) throw Error("an adopted claim requires an explicit native client");
      if (request.defaultBranch && view.tip.defaultBranch !== request.defaultBranch) throw Error("claim default branch differs from the canonical remote");
      const branch = git.text("rev-parse", "--abbrev-ref", "HEAD");
      const association = associate(git, view.tip.main, view.binding.repository, request, branch);
      const env = request.env ?? process.env;
      const identity = writer(env, association.locator, request.client);
      const matches = matching(view.state, association.aliases);
      if (matches.length > 1) throw Error("feature aliases have conflicting reservations; ask the owner to reconcile them");
      const current = matches[0];
      if (current?.conflict) return { ...describeRecord(git, current, "held"), reason: "feature aliases conflict; ask the owner to select one reservation" };
      if (current?.pending) return { ...describeRecord(git, current, "held"), reason: "issue creation is pending; use read-only lookup and owner-confirmed recovery" };
      if (pending && current?.operation === operation && JSON.stringify(current) === JSON.stringify(pending)) return describeRecord(git, current, "entered", view.tip.reservation);
      if (current && current.writer.fingerprint !== identity.fingerprint) {
        return { ...describeRecord(git, current, "held"), reason: "another session holds this item; if this was your previous reservation, it has been handed off" };
      }
      if (pending && JSON.stringify(current) !== JSON.stringify(prior)) throw Error("attempted reservation was superseded; inspect the current writer before retrying");
      if (!current && association.claimed) throw Error("existing claim has no reservation; ask the owner to reconcile it");
      const aliases = [...new Set([...(current?.aliases ?? []), ...association.aliases])];
      if (current && current.writer.host === identity.host && current.writer.locator === identity.locator &&
          current.writer.checkout === localCheckout(git, false) && aliases.length === current.aliases.length) {
        return describeRecord(git, current, "entered", view.tip.reservation);
      }
      if (request.noPush) throw Error("reservation update requires Git permission for the coordination ref");
      const mine = currentWriter(git, env, association.locator, request.client);
      pending = { aliases, writer: mine, operation };
      prior = current;
      publish(git, view, { ...view.state, operation, items: [...view.state.items.filter(record => record !== current), pending] });
    }
    throw Error(`unable to verify the reservation update on ${REF}; inspect the current writer before retrying`);
  } catch (error) {
    return { status: "held", reason: error instanceof Error ? error.message : "could not verify the reservation" };
  }
}
