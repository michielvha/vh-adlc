import { executeAttempt, pendingAttempt, PublicationExecutionError } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reconcileAbsent, inspectRetainedOperation, restoreRetainedOperation } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";
import { createNativeTransport } from "../../../plugins/vh-adlc/scripts/docs-drift/transport";
import { effectMarker, validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { sealPlan, writePlanObject, createJournal, writePublicationObjects, appendIntent, appendOutcome, readJournal } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationMarker } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { fixture, hash, role, bindings } from "./manifest-fixture";
import { settingsFixture } from "./settings-fixture";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function setup() {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "vh-native-transport-")));
  roots.push(root);
  const repo = join(root, "source"), artifacts = join(root, "artifacts"), parent = join(root, "objects"), evidence = join(root, "evidence"), bin = join(root, "bin");
  for (const path of [repo, artifacts, parent, evidence, bin]) mkdirSync(path, { mode: 0o700 });
  readGit(repo, "init", "--template=", "-b", "main");
  writeFileSync(join(repo, "README.md"), "Synthetic native boundary fixture\n");
  readGit(repo, "add", "--", "README.md");
  readGit(repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  const commit = readGit(repo, "rev-parse", "HEAD").toString().trim(), tree = readGit(repo, "rev-parse", "HEAD^{tree}").toString().trim();
  const settings = parseSettings(settingsFixture());
  const store = createOwnedObjectStore({ parent, evidence_directory: evidence, source_repo: repo, source_commit: commit, repository: "fixture/docs", owner: "fixture", run: "fixture-run" });
  const defaults = fixture({ ...bindings, source_commit: commit, candidate_commit: commit, candidate_tree: tree });
  const input = fixture(defaults.manifest.bindings, [
    { id: "lease", kind: "lease-acquire", payload: { ref: settings.publication.lease_ref } },
    { id: "receipt", kind: "receipt-retain", payload: { ref: settings.publication.receipt_ref_prefix + "operation-1" } },
    ...defaults.manifest.effects,
  ]);
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, adoption_sha256: hash("adoption"), publication_kind: "advisory" as const, context: "trial", transport: "native", corrections: [], attention: [] });
  const objects = writePlanObject(store, plan);
  const statePath = join(root, "state.json"), calls = join(root, "calls.jsonl");
  const readme = readGit(repo, "show", "HEAD:README.md"), blobSha = readGit(repo, "rev-parse", "HEAD:README.md").toString().trim();
  const planBytes = canonicalJSON(plan);
  const state = { commit, tree,
    metadata_commit: { sha: objects.object, tree: { sha: objects.tree }, parents: [] as Array<{ sha: string }>, message: "retained metadata" },
    metadata_tree: { sha: objects.tree, truncated: false, tree: [{ path: "plan.json", mode: "100644", type: "blob", sha: objects.blob }] },
    metadata_blob: { sha: objects.blob, encoding: "base64", size: planBytes.length, content: planBytes.toString("base64") },
    blob: { sha: blobSha, encoding: "base64", size: readme.length, content: readme.toString("base64") },
    tree_response: { sha: tree, truncated: false, tree: [{ path: "README.md", mode: "100644", type: "blob", sha: blobSha }] },
    issues: [] as Array<Record<string, unknown>>, comments: {} as Record<string, Array<Record<string, unknown>>>, refs: {} as Record<string, string>, prs: [] as Array<Record<string, unknown>>, race: false, forbidden: false, app_token: false, graphql_errors: false, reject_git: false, reject_http: 0, partial_pr_error: false };
  writeFileSync(statePath, JSON.stringify(state));
  const program = `#!${process.execPath}
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const statePath = ${JSON.stringify(statePath)}, log = ${JSON.stringify(calls)};
const state = JSON.parse(readFileSync(statePath, 'utf8')), args = process.argv.slice(2);
appendFileSync(log, JSON.stringify({ program: process.argv[1].split('/').at(-1), args }) + '\\n');
const save = () => writeFileSync(statePath, JSON.stringify(state));
const option = name => args[args.indexOf(name) + 1];
if (process.argv[1].endsWith('/git')) {
    const leases = args.filter(a => a.startsWith('--force-with-lease=')).map(arg => {
        const value = arg.slice(19), split = value.lastIndexOf(':');
        return { ref: value.slice(0, split), expected: value.slice(split + 1) };
    });
    const separator = args.indexOf('--', args.indexOf('push'));
    const updates = args.slice(separator + 2).map(spec => {
        const split = spec.indexOf(':'), head = spec.slice(0, split), ref = spec.slice(split + 1);
        const lease = leases.find(lease => lease.ref === ref);
        if (!lease) process.exit(2);
        return { ref, head, expected: lease.expected };
    });
    if (state.reject_git) {
        process.stdout.write('To https://github.com/fixture/docs.git\\n' + updates.map(item => '!\\t' + item.head + ':' + item.ref + '\\t[remote rejected] (pre-receive hook declined)\\n').join('') + 'Done\\n');
        process.exit(1);
    }
    if (state.race) {
        state.refs[updates[0].ref] = 'f'.repeat(40);
        state.race = false;
        save();
    }
    for (const update of updates) {
        const current = state.refs[update.ref] ?? '';
        if (current !== update.head && current !== update.expected) process.exit(1);
    }
    for (const { ref, head } of updates) {
        if (head) {
            state.refs[ref] = head;
            for (const pr of state.prs) if ('refs/heads/' + pr.head.ref === ref) pr.head.sha = head;
        } else delete state.refs[ref];
    }
    save();
    process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'create') {
    const branch = option('--head'), body = readFileSync(option('--body-file'), 'utf8');
    state.prs.push({ number: 501, state: 'open', title: args.find(a => a.startsWith('--title=')).slice(8), body, draft: args.includes('--draft'),
        labels: args.filter(a => a.startsWith('--label=')).map(a => ({ name: a.slice(8) })), user: { login: 'fixture-bot', id: 20 },
        base: { ref: 'main', repo: { id: 10 } }, head: { ref: branch, sha: state.refs['refs/heads/' + branch], repo: { id: 10 } } });
    save();
    process.exit(state.partial_pr_error ? 1 : 0);
}
if (args.includes('graphql')) {
    const response = { data: { viewer: { login: 'fixture-bot', databaseId: 20 } } };
    if (state.graphql_errors)
        response.errors = [{ message: 'denied' }];
    process.stdout.write(JSON.stringify(response));
    process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'ready') {
    state.prs.find(pr => pr.number === Number(args[2])).draft = args.includes('--undo');
    save();
    process.exit(0);
}
const endpoint = args.find(a => a === 'user' || a.startsWith('repos/'));
const method = option('--method');
if (method !== 'GET') {
    if (state.reject_http) {
        process.stdout.write('HTTP/2.0 ' + state.reject_http + ' rejected\\r\\n\\r\\n{"message":"rejected"}');
        process.exit(1);
    }
    const payload = JSON.parse(readFileSync(option('--input'), 'utf8'));
    if (method === 'POST' && endpoint === 'repos/fixture/docs/issues')
        state.issues.push({ ...payload, id: 801, number: 601, user: { login: 'fixture-bot', id: 20 }, labels: payload.labels.map(name => ({ name })) });
    else if (method === 'POST' && endpoint.endsWith('/comments')) {
        const number = endpoint.split('/').at(-2);
        (state.comments[number] ??= []).push({ id: 701, body: payload.body, user: { login: 'fixture-bot', id: 20 } });
    }
    else if (method === 'PATCH' && endpoint.includes('/pulls/'))
        Object.assign(state.prs.find(pr => pr.number === Number(endpoint.split('/').at(-1))), payload);
    else if (method === 'PUT' && endpoint.endsWith('/labels'))
        state.prs.find(pr => pr.number === Number(endpoint.split('/').at(-2))).labels = payload.labels.map(name => ({ name }));
    else
        process.exit(1);
    save();
    process.stdout.write('{}');
    process.exit(0);
}
let status = 200, value;
if (endpoint === 'user') {
    if (state.app_token) {
        status = 403;
        value = { message: 'Resource not accessible by integration' };
    }
    else
        value = { login: 'fixture-bot', id: 20 };
}
else if (endpoint === 'repos/fixture/docs')
    value = { id: 10, full_name: 'fixture/docs', default_branch: 'main' };
else if (endpoint === 'repos/fixture/docs/git/commits/' + state.commit)
    value = { sha: state.commit, tree: { sha: state.tree }, parents: [], message: 'fixture' };
else if (endpoint === 'repos/fixture/docs/git/commits/' + state.metadata_commit.sha)
    value = state.metadata_commit;
else if (endpoint === 'repos/fixture/docs/git/trees/' + state.metadata_tree.sha)
    value = state.metadata_tree;
else if (endpoint === 'repos/fixture/docs/git/blobs/' + state.metadata_blob.sha)
    value = state.metadata_blob;
else if (endpoint === 'repos/fixture/docs/git/trees/' + state.tree)
    value = state.tree_response;
else if (endpoint === 'repos/fixture/docs/git/blobs/' + state.blob.sha)
    value = state.blob;
else if (endpoint?.startsWith('repos/fixture/docs/git/ref/')) {
    const ref = 'refs/' + decodeURIComponent(endpoint.slice('repos/fixture/docs/git/ref/'.length));
    if (state.forbidden) {
        status = 403;
        value = { message: 'denied' };
    }
    else if (state.refs[ref])
        value = { ref, object: { type: 'commit', sha: state.refs[ref] } };
    else {
        status = 404;
        value = { message: 'Not Found' };
    }
}
else if (endpoint?.startsWith('repos/fixture/docs/pulls?')) {
    const query = new URL(endpoint, 'https://example.invalid/').searchParams;
    const base = query.get('base'), branch = query.get('head')?.split(':').at(-1);
    value = state.prs.filter(pr => (!base || pr.base.ref === base) && (!branch || pr.head.ref === branch));
}
else if (endpoint?.startsWith('repos/fixture/docs/pulls/'))
    value = state.prs.find(pr => pr.number === Number(endpoint.split('/').at(-1)));
else if (endpoint?.includes('/comments?'))
    value = state.comments[endpoint.split('/').at(-2)] ?? [];
else if (endpoint?.startsWith('repos/fixture/docs/issues?'))
    value = state.issues;
else {
    status = 500;
    value = { message: 'unexpected fixture endpoint' };
}
process.stdout.write('HTTP/2.0 ' + status + ' fixture\\r\\n\\r\\n' + JSON.stringify(value ?? null));
process.exit(status === 200 ? 0 : 1);
`;
  for (const name of ["gh", "git"]) writeFileSync(join(bin, name), program, { mode: 0o700 });
  const transport = createNativeTransport({ settings, object_store: store, artifact_root: artifacts, source_repo: repo, credential: "synthetic-credential", path: bin + ":" + process.env.PATH });
  const update = (change: (value: typeof state) => void) => { const value = JSON.parse(readFileSync(statePath, "utf8")) as typeof state; change(value); writeFileSync(statePath, JSON.stringify(value)); };
  const inspect = () => JSON.parse(readFileSync(statePath, "utf8")) as typeof state;
  return { root, settings, store, plan, objects, transport, update, inspect, calls, commit, readme };
}

test("native transport pins observed identities and uses absence-bound Git ref creation", async () => {
  const f = setup();
  expect(await f.transport.identity()).toEqual({ repository: "fixture/docs", repository_id: 10, default_branch: "main", actor: "fixture-bot", actor_id: 20 });
  const lease: Effect = { id: "lease", kind: "lease-acquire", payload: { ref: f.settings.publication.lease_ref } };
  expect(await f.transport.ref(String(lease.payload.ref))).toEqual({ state: "absent" });
  const selected = acquisition(f);
  await f.transport.execute(f.plan, lease, selected.objects, "attempt-native-lease");
  const artifacts = join(f.root, "artifacts");
  const ownerPath = readdirSync(artifacts).find(path => path.endsWith(".native-command.json"));
  if (!ownerPath) throw Error("missing native command owner record");
  const owner = JSON.parse(readFileSync(join(artifacts, ownerPath), "utf8"));
  expect(owner.effect_id).toBe("lease");
  expect(owner.attempt_id).toBe("attempt-native-lease");
  expect((await f.transport.observe(f.plan, lease, selected.objects)).state).toBe("done");
  const calls = readFileSync(f.calls, "utf8");
  expect(calls).toContain('--force-with-lease=' + f.settings.publication.lease_ref + ':');
  expect(calls).not.toContain("synthetic-credential");
  expect(f.inspect().refs[f.settings.publication.lease_ref]).toBe(selected.objects.lease_object);
});

test("native atomic leases refuse a changed remote ref without replacing it", async () => {
  const f = setup(); await f.transport.identity(); f.update(state => { state.race = true; });
  const lease: Effect = { id: "lease", kind: "lease-acquire", payload: { ref: f.settings.publication.lease_ref } };
  const selected = acquisition(f);
  const error = await f.transport.execute(f.plan, lease, selected.objects).then(() => null, error => error);
  expect(error).toBeInstanceOf(PublicationExecutionError);
  expect(error.sent).toBe(true);
  expect(error.reaped).toBe(true);
  expect(f.inspect().refs[f.settings.publication.lease_ref]).toBe("f".repeat(40));
});

test("native PR delivery retains the reviewed fields and refuses changed observed payloads", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.refs["refs/heads/docs-drift/one"] = f.commit; });
  const pr: Effect = { id: "pr", kind: "pr-create", payload: { base: "main", branch: "docs-drift/one", title: "Exact title", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("pr"), labels: ["documentation"], draft: true } };
  expect((await f.transport.observe(f.plan, pr, f.objects)).state).toBe("absent");
  await f.transport.execute(f.plan, pr, f.objects);
  expect((await f.transport.observe(f.plan, pr, f.objects)).state).toBe("done");
  f.update(state => { state.prs[0].body = "edited externally"; });
  expect((await f.transport.observe(f.plan, pr, f.objects)).state).toBe("conflict");
});

test("native permission errors are unknown and never become complete absence", async () => {
  const f = setup(); await f.transport.identity(); f.update(state => { state.forbidden = true; });
  const lease: Effect = { id: "lease", kind: "lease-acquire", payload: { ref: f.settings.publication.lease_ref } };
  expect((await f.transport.observe(f.plan, lease, f.objects)).state).toBe("unknown");
});

test("explicit legacy targets stay available for explanation and post-merge closure", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.prs.push({ number: 77, state: "closed", user: { login: "legacy-bot", id: 90 }, head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
  const closure: Effect = { id: "close", kind: "pr-close", payload: { number: 77, expected_head: f.commit } };
  expect((await f.transport.observe(f.plan, closure, f.objects)).state).toBe("done");
});

test("native PR creation refuses a branch that no longer names the reviewed candidate", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.refs["refs/heads/docs-drift/one"] = "f".repeat(40); });
  const pr: Effect = { id: "pr", kind: "pr-create", payload: { base: "main", branch: "docs-drift/one", title: "Exact title", body: "Exact body", labels: [], draft: true } };
  const error = await f.transport.execute(f.plan, pr, f.objects).then(() => null, error => error);
  expect(error).toBeInstanceOf(PublicationExecutionError);
  expect(error.sent).toBe(false);
  expect(error.reaped).toBe(true);
  expect(f.inspect().prs).toHaveLength(0);
});

test("a ref 404 without a successful native contents observation stays unavailable", async () => {
  const f = setup();
  await expect(f.transport.ref(f.settings.publication.lease_ref)).rejects.toThrow();
});

test("an already-matching refreshed head still requires current PR ownership", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => {
    state.refs["refs/heads/docs-drift/one"] = f.commit;
    state.prs.push({ number: 501, state: "open", user: { login: "foreign", id: 99 }, head: { ref: "docs-drift/one", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } });
  });
  const refresh: Effect = { id: "refresh", kind: "branch-refresh", payload: { number: 501, ref: "refs/heads/docs-drift/one", expected_head: "e".repeat(40), head: f.commit } };
  expect((await f.transport.observe(f.plan, refresh, f.objects)).state).not.toBe("done");
});


test("native issue evidence is read from bound Git objects before exact issue creation", async () => {
  const f = setup(); await f.transport.identity();
  const body = publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("issue") + `\nhttps://github.com/fixture/docs/blob/${f.commit}/README.md`;
  const issue: Effect = { id: "issue", kind: "issue-create", payload: { title: "Selected issue", body, labels: ["documentation"], prior_ids: [], evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.commit, evidence_sha256: sha256(f.readme) } };
  expect((await f.transport.observe(f.plan, issue, f.objects)).state).toBe("absent");
  await f.transport.execute(f.plan, issue, f.objects);
  expect((await f.transport.observe(f.plan, issue, f.objects)).state).toBe("done");
  f.update(state => { state.issues[0].body = body + "\nchanged payload"; });
  expect((await f.transport.observe(f.plan, issue, f.objects)).state).toBe("conflict");
  f.update(state => { state.issues[0].body = "edited"; });
  expect((await f.transport.observe(f.plan, issue, f.objects)).state).toBe("absent");
  const changed = { ...issue, payload: { ...issue.payload, evidence_sha256: hash("wrong bytes") } };
  await expect(f.transport.execute(f.plan, changed, f.objects)).rejects.toBeInstanceOf(PublicationExecutionError);
  expect(f.inspect().issues).toHaveLength(1);
});

test("native comment and closure keep legacy authors and exact target heads", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.prs.push({ number: 77, state: "open", user: { login: "legacy-bot", id: 90 }, head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
  const comment: Effect = { id: "explain", kind: "comment-create", payload: { number: 77, body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("explain"), prior_ids: [] } };
  await f.transport.execute(f.plan, comment, f.objects);
  expect((await f.transport.observe(f.plan, comment, f.objects)).state).toBe("done");
  const close: Effect = { id: "close", kind: "pr-close", payload: { number: 77, expected_head: f.commit } };
  await f.transport.execute(f.plan, close, f.objects);
  expect((await f.transport.observe(f.plan, close, f.objects)).state).toBe("done");
  expect(f.inspect().comments["77"]).toHaveLength(1);
});

test("native PR updates distinguish the approved old payload, partial changes and exact completion", async () => {
  const f = setup(); await f.transport.identity();
  const original = { title: "Old title", body: "Old body", labels: ["old"], draft: false };
  f.update(state => { state.prs.push({ ...original, labels: [{ name: "old" }], number: 501, state: "open", user: { login: "fixture-bot", id: 20 }, head: { ref: "docs-drift/one", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
  const update: Effect = { id: "update", kind: "pr-update", payload: { number: 501, expected_head: f.commit, expected_payload_sha256: sha256(canonicalJSON(original)), expected_payload: original, title: "New title", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("update"), labels: ["documentation"], draft: true } };
  expect((await f.transport.observe(f.plan, update, f.objects)).state).toBe("absent");
  f.update(state => { state.prs[0].title = update.payload.title; state.prs[0].body = update.payload.body; });
  expect((await f.transport.observe(f.plan, update, f.objects)).state).toBe("absent");
  f.update(state => { state.prs[0].labels = [{ name: "documentation" }]; });
  expect((await f.transport.observe(f.plan, update, f.objects)).state).toBe("absent");
  await f.transport.execute(f.plan, update, f.objects);
  expect((await f.transport.observe(f.plan, update, f.objects)).state).toBe("done");
  f.update(state => { state.prs[0].title = "Partial title"; });
  expect((await f.transport.observe(f.plan, update, f.objects)).state).toBe("conflict");
});

test("native configured refs preserve valid Unicode identities", async () => {
  const f = setup(); await f.transport.identity();
  const ref = "refs/heads/docs-drift-receipts/évidence";
  f.update(state => { state.refs[ref] = f.commit; });
  expect(await f.transport.ref(ref)).toEqual({ state: "present", object: f.commit });
});

test("removed issue markers remain visible in the native absence inventory", async () => {
  const f = setup(); await f.transport.identity();
  const body = publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("issue") + `\nhttps://github.com/fixture/docs/blob/${f.commit}/README.md`;
  const issue: Effect = { id: "issue", kind: "issue-create", payload: { title: "Selected issue", body, labels: [], prior_ids: [], evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.commit, evidence_sha256: sha256(f.readme) } };
  await f.transport.execute(f.plan, issue, f.objects);
  f.update(state => { state.issues[0].body = "marker removed"; });
  expect((await f.transport.observe(f.plan, issue, f.objects)).state).toBe("absent");
});


test("native refresh uses the exact old head and preserves competing heads", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => {
    state.refs["refs/heads/docs-drift/one"] = "e".repeat(40);
    state.prs.push({ number: 501, state: "open", user: { login: "fixture-bot", id: 20 }, head: { ref: "docs-drift/one", sha: "e".repeat(40), repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } });
  });
  const refresh: Effect = { id: "refresh", kind: "branch-refresh", payload: { number: 501, ref: "refs/heads/docs-drift/one", expected_head: "e".repeat(40), head: f.commit } };
  expect((await f.transport.observe(f.plan, refresh, f.objects)).state).toBe("absent");
  await f.transport.execute(f.plan, refresh, f.objects);
  expect((await f.transport.observe(f.plan, refresh, f.objects)).state).toBe("done");
  const callLog = readFileSync(f.calls, "utf8");
  expect(callLog).toContain('--force-with-lease=refs/heads/docs-drift/one:' + "e".repeat(40));
  f.update(state => { state.refs["refs/heads/docs-drift/one"] = "f".repeat(40); });
  await expect(f.transport.execute(f.plan, refresh, f.objects)).rejects.toBeInstanceOf(PublicationExecutionError);
  expect(f.inspect().refs["refs/heads/docs-drift/one"]).toBe("f".repeat(40));
});

test("removed explanation markers remain visible in the native absence inventory", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.prs.push({ number: 77, state: "open", user: { login: "legacy-bot", id: 90 }, head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
  const comment: Effect = { id: "explain", kind: "comment-create", payload: { number: 77, body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("explain"), prior_ids: [] } };
  await f.transport.execute(f.plan, comment, f.objects);
  f.update(state => { state.comments["77"][0].body = "marker removed"; });
  expect((await f.transport.observe(f.plan, comment, f.objects)).state).toBe("absent");
  expect(f.inspect().comments["77"]).toHaveLength(1);
});


test("native retained-plan reads require parentless metadata-only Git objects and exact raw bytes", async () => {
  const f = setup(); await f.transport.identity();
  const retained = await f.transport.readPlanObject(f.objects.object);
  expect(retained.objects).toEqual(f.objects);
  expect(Buffer.from(retained.bytes).equals(canonicalJSON(f.plan))).toBe(true);
  await expect(f.transport.readPlanObject(f.commit)).rejects.toThrow("metadata");
  f.update(state => { state.metadata_commit.parents.push({ sha: "f".repeat(40) }); });
  await expect(f.transport.readPlanObject(f.objects.object)).rejects.toThrow("metadata");
});


test("installation-token identity uses native authenticated viewer metadata", async () => {
  const f = setup(); f.update(state => { state.app_token = true; });
  expect((await f.transport.identity()).actor_id).toBe(20);
});

test("partial native viewer errors deny identity even when viewer fields are present", async () => {
  const f = setup(); f.update(state => { state.graphql_errors = true; });
  await expect(f.transport.identity()).rejects.toThrow();
});

test("duplicate native inventory IDs cannot establish complete absence", async () => {
  const f = setup(); await f.transport.identity();
  const existing = { id: 801, number: 601, title: "Old issue", body: "Earlier item", labels: [], user: { login: "fixture-bot", id: 20 } };
  f.update(state => { state.issues = [existing, structuredClone(existing)]; });
  const issue: Effect = { id: "issue", kind: "issue-create", payload: { title: "Selected issue", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("issue") + `\nhttps://github.com/fixture/docs/blob/${f.commit}/README.md`, labels: [], prior_ids: [801], evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.commit, evidence_sha256: sha256(f.readme) } };
  expect((await f.transport.observe(f.plan, issue, f.objects)).state).toBe("unknown");
});


test("retained lookup evidence excludes repository credential fields", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.prs.push({ number: 77, state: "open", user: { login: "legacy-bot", id: 90 }, head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10, temp_clone_token: "fixture-sensitive-token" } }, base: { ref: "main", repo: { id: 10, temp_clone_token: "fixture-sensitive-token" } } }); });
  const close: Effect = { id: "close", kind: "pr-close", payload: { number: 77, expected_head: f.commit } };
  const result = await f.transport.observe(f.plan, close, f.objects);
  expect(result.state).toBe("absent");
  if (result.state !== "absent" || !result.evidence) throw Error("missing native lookup evidence");
  expect(readFileSync(result.evidence.path, "utf8")).not.toContain("fixture-sensitive-token");
});


test("an exact created PR awaiting its approved labels stays unknown without material conflict", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.refs["refs/heads/docs-drift/one"] = f.commit; });
  const pr: Effect = { id: "pr", kind: "pr-create", payload: { base: "main", branch: "docs-drift/one", title: "Reviewed title",
    body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("pr"), labels: ["documentation"], draft: true } };
  await f.transport.execute(f.plan, pr, f.objects);
  f.update(state => { state.prs[0].labels = []; });
  expect(await f.transport.observe(f.plan, pr, f.objects)).toEqual({ state: "unknown", reason: "native-PR-labels-incomplete" });
});

test("an owned refresh waits for PR head propagation instead of claiming foreign change", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => {
    state.refs["refs/heads/docs-drift/one"] = f.commit;
    state.prs.push({ number: 501, state: "open", user: { login: "fixture-bot", id: 20 },
      head: { ref: "docs-drift/one", sha: "e".repeat(40), repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } });
  });
  const refresh: Effect = { id: "refresh", kind: "branch-refresh", payload: { number: 501, ref: "refs/heads/docs-drift/one", expected_head: "e".repeat(40), head: f.commit } };
  expect(await f.transport.observe(f.plan, refresh, f.objects)).toEqual({ state: "unknown", reason: "native-PR-head-sync-pending" });
  f.update(state => { (state.prs[0].head as { sha: string }).sha = f.commit; });
  expect((await f.transport.observe(f.plan, refresh, f.objects)).state).toBe("done");
});

test("unexplained actor activity remains inventory data under the journal dispatch guard", async () => {
  const f = setup(); await f.transport.identity();
  const issue: Effect = { id: "issue", kind: "issue-create", payload: { title: "Selected issue",
    body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("issue") + `\nhttps://github.com/fixture/docs/blob/${f.commit}/README.md`,
    labels: [], prior_ids: [], evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.commit, evidence_sha256: sha256(f.readme) } };
  for (const body of ["Unrelated workflow notice", publicationMarker(f.settings, "other-operation")]) {
    f.update(state => { state.issues = [{ id: 901, number: 701, title: "Other item", body, labels: [], user: { login: "fixture-bot", id: 20 } }]; });
    expect((await f.transport.observe(f.plan, issue, f.objects)).state).toBe("absent");
  }
});


test("unrelated actor items cannot hide an exact native comment outcome or prevent its first dispatch", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => {
    state.prs.push({ number: 77, state: "open", user: { login: "legacy-bot", id: 90 },
      head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } });
    state.comments["77"] = [{ id: 690, body: "Unrelated CI notice", user: { login: "fixture-bot", id: 20 } }];
  });
  const effect: Effect = { id: "explain", kind: "comment-create", payload: { number: 77,
    body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("explain"), prior_ids: [] } };
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("absent");
  await f.transport.execute(f.plan, effect, f.objects);
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("done");
  const calls = readFileSync(f.calls, "utf8").split("\n").filter(line => line.includes('"POST"') && line.includes('/comments'));
  expect(calls).toHaveLength(1);
});


test("a different native lease holder after release proves this run no longer owns the ref", async () => {
  const f = setup(); await f.transport.identity();
  const objects = { ...f.objects, lease_object: "a".repeat(40) };
  const effect: Effect = { id: "release", kind: "lease-release", payload: { ref: f.settings.publication.lease_ref } };
  f.update(state => { state.refs[f.settings.publication.lease_ref] = objects.lease_object; });
  await f.transport.execute(f.plan, effect, objects);
  f.update(state => { state.refs[f.settings.publication.lease_ref] = "f".repeat(40); });
  const observed = await f.transport.observe(f.plan, effect, objects);
  expect(observed.state).toBe("done");
  expect(f.inspect().refs[f.settings.publication.lease_ref]).toBe("f".repeat(40));
});


function acquisition(f: ReturnType<typeof setup>) {
  const journal = createJournal({ source_repo: join(f.root, "source"), artifact_root: join(f.root, "artifacts"), plan: f.plan });
  return { journal, plan: f.plan, objects: writePublicationObjects(f.store, f.plan, journal.header), effect: f.plan.manifest.effects[0] };
}

function realGitServer(f: ReturnType<typeof setup>, advertiseAtomic = true) {
  const server = join(f.root, "receive.git");
  readGit(f.root, "init", "--bare", "--template=", server);
  if (!advertiseAtomic) readGit(server, "config", "receive.advertiseAtomic", "false");
  writeFileSync(join(f.root, "bin/git"), `#!${process.execPath}
const args = process.argv.slice(2), target = 'https://github.com/fixture/docs.git';
if (args.filter(arg => arg === target).length !== 1) process.exit(90);
const push = args.indexOf('push');
if (push < 0) process.exit(91);
args.splice(push, 0, '-c', 'protocol.file.allow=always');
const result = Bun.spawnSync(['/usr/bin/git', ...args.map(arg => arg === target ? ${JSON.stringify(server)} : arg)], { stdout: 'pipe', stderr: 'pipe' });
process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exit(result.exitCode);
`, { mode: 0o700 });
  return server;
}

test("atomic acquisition cannot leave a lease when another same-plan receipt already exists on real Git", async () => {
  const f = setup(); await f.transport.identity();
  const selected = acquisition(f), server = realGitServer(f);
  const receipt = f.settings.publication.receipt_ref_prefix + "operation-1";
  readGit(f.store.root, "-c", "protocol.file.allow=always", "push", "--", server, selected.objects.object + ":" + receipt);
  await expect(f.transport.execute(selected.plan, selected.effect, selected.objects)).rejects.toBeInstanceOf(PublicationExecutionError);
  expect(() => readGit(server, "rev-parse", "--verify", f.settings.publication.lease_ref)).toThrow();
  expect(readGit(server, "rev-parse", receipt).toString().trim()).toBe(selected.objects.object);
});

test("real Git atomic acquisition either creates both refs or fails without sequential fallback", async () => {
  for (const supported of [true, false]) {
    const f = setup(); await f.transport.identity();
    const selected = acquisition(f), server = realGitServer(f, supported);
    const run = f.transport.execute(selected.plan, selected.effect, selected.objects);
    const receipt = f.settings.publication.receipt_ref_prefix + "operation-1";
    if (supported) {
      await run;
      expect(readGit(server, "rev-parse", f.settings.publication.lease_ref).toString().trim()).toBe(selected.objects.lease_object);
      expect(readGit(server, "rev-parse", receipt).toString().trim()).toBe(selected.objects.lease_object);
    } else {
      await expect(run).rejects.toBeInstanceOf(PublicationExecutionError);
      expect(() => readGit(server, "rev-parse", "--verify", f.settings.publication.lease_ref)).toThrow();
      expect(() => readGit(server, "rev-parse", "--verify", receipt)).toThrow();
    }
  }
});


test("real Git treats an identical retained receipt as up to date, so uncertain acquisition cannot be replayed", async () => {
  const f = setup(); await f.transport.identity();
  const selected = acquisition(f), server = realGitServer(f);
  await f.transport.execute(selected.plan, selected.effect, selected.objects);
  readGit(server, "update-ref", "-d", f.settings.publication.lease_ref, selected.objects.lease_object);
  // This direct lower-level call models the retry refused by the journal controller.
  await f.transport.execute(selected.plan, selected.effect, selected.objects);
  expect(readGit(server, "rev-parse", f.settings.publication.lease_ref).toString().trim()).toBe(selected.objects.lease_object);
  expect(readGit(server, "rev-parse", f.settings.publication.receipt_ref_prefix + "operation-1").toString().trim()).toBe(selected.objects.receipt_object);
});


test("positive native Git rejection permits a new attempt while damaged proof stays pending", async () => {
  const f = setup(); await f.transport.identity();
  const selected = acquisition(f);
  let journal = appendIntent(selected.journal, selected.effect.id);
  f.update(state => { state.reject_git = true; });
  await expect(executeAttempt({ journal, effect: selected.effect, objects: selected.objects, transport: f.transport })).rejects.toBeInstanceOf(PublicationExecutionError);
  journal = readJournal(journal.directory, join(f.root, "source"));
  expect(pendingAttempt(journal, selected.effect)).toBeNull();
  expect(pendingAttempt(journal, f.plan.manifest.effects[1])).toBeNull();
  const ended = journal.events.findLast(event => event.kind === "attempt-ended");
  if (!ended || !("rejection" in ended.payload) || !ended.payload.rejection) throw Error("missing positive rejection proof");
  const proof = readFileSync(ended.payload.rejection.path);
  writeFileSync(ended.payload.rejection.path, "{}");
  expect(pendingAttempt(journal, selected.effect)).toBe("rejection-proof-unavailable");
  writeFileSync(ended.payload.rejection.path, proof);
  f.update(state => { state.reject_git = false; });
  journal = await executeAttempt({ journal, effect: selected.effect, objects: selected.objects, transport: f.transport });
  expect((await f.transport.observe(journal.plan, selected.effect, selected.objects)).state).toBe("done");
});

test("a complete API rejection differs from retryable and partial native CLI failures", async () => {
  for (const status of [403, 408, 429, 502]) {
    const f = setup(); await f.transport.identity(); f.update(state => {
      state.reject_http = status;
      state.prs.push({ number: 77, state: "open", user: { login: "legacy-bot", id: 90 },
        head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } });
    });
    const effect: Effect = { id: "comment", kind: "comment-create", payload: { number: 77, prior_ids: [], body: "exact body" } };
    const error = await f.transport.execute(f.plan, effect, f.objects, "http-rejection-attempt").then(() => null, error => error);
    expect(error).toBeInstanceOf(PublicationExecutionError);
    expect(Boolean(error.rejection)).toBe(status === 403);
  }
  const f = setup(); await f.transport.identity(); f.update(state => {
    state.refs["refs/heads/docs-drift/one"] = f.commit; state.partial_pr_error = true;
  });
  const effect = f.plan.manifest.effects.find(effect => effect.kind === "pr-create")!;
  const error = await f.transport.execute(f.plan, effect, f.objects, "partial-creation").then(() => null, error => error);
  expect(error).toBeInstanceOf(PublicationExecutionError);
  expect(error.rejection).toBeUndefined();
  expect(f.inspect().prs).toHaveLength(1);
});


test("a positively rejected native candidate push permits separately approved retirement and lease cleanup", async () => {
  const f = setup(); await f.transport.identity();
  const release: Effect = { id: "release", kind: "lease-release", payload: { ref: f.settings.publication.lease_ref } };
  const input = fixture(f.plan.manifest.bindings, [...f.plan.manifest.effects, release]);
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants,
    adoption_sha256: hash("adoption"), publication_kind: "advisory" as const, context: "trial", transport: "native", corrections: [], attention: [] });
  const repo = join(f.root, "source"), artifacts = join(f.root, "artifacts");
  let journal = createJournal({ source_repo: repo, artifact_root: artifacts, plan });
  const objects = writePublicationObjects(f.store, plan, journal.header);
  journal = appendIntent(journal, "lease");
  journal = await executeAttempt({ journal, effect: plan.manifest.effects[0], objects, transport: f.transport });
  for (const effect of plan.manifest.effects.slice(0, 2)) {
    const observed = await f.transport.observe(plan, effect, objects);
    if (observed.state !== "done") throw Error("missing metadata observation");
    journal = appendOutcome(journal, effect.id, observed.outcome);
  }
  const push = plan.manifest.effects[2];
  journal = appendIntent(journal, push.id);
  f.update(state => { state.reject_git = true; });
  await expect(executeAttempt({ journal, effect: push, objects, transport: f.transport })).rejects.toBeInstanceOf(PublicationExecutionError);
  f.update(state => { state.reject_git = false; });
  const cleaned = await reconcileAbsent({ source_repo: repo, journal_directory: journal.directory, object_store: f.store,
    settings: f.settings, transport: f.transport, retire_effect_ids: ["push", "pr"],
    authorize: async scope => ({ scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("actual selected cleanup request") }) });
  expect(cleaned.state).toBe("retired");
  expect(cleaned.journal.events.some(event => event.effect_id === push.id && event.kind === "retired-absence")).toBe(true);
  expect(cleaned.journal.events.some(event => event.effect_id === push.id && event.kind === "outcome")).toBe(false);
  expect(f.inspect().refs[f.settings.publication.lease_ref]).toBeUndefined();
});

test("actual Git rejection supplies positive proof for both atomic metadata refs", async () => {
  const f = setup(); await f.transport.identity();
  const selected = acquisition(f), server = realGitServer(f);
  const receipt = f.settings.publication.receipt_ref_prefix + "operation-1";
  readGit(f.store.root, "-c", "protocol.file.allow=always", "push", "--", server, selected.objects.object + ":" + receipt);
  const error = await f.transport.execute(selected.plan, selected.effect, selected.objects, "real-rejected-atomic-push").then(() => null, error => error);
  expect(error).toBeInstanceOf(PublicationExecutionError);
  expect(error.rejection).toBeDefined();
  expect(() => readGit(server, "rev-parse", "--verify", f.settings.publication.lease_ref)).toThrow();
  expect(readGit(server, "rev-parse", receipt).toString().trim()).toBe(selected.objects.object);
});

test("native conflicting PR-head evidence preserves the actual conflict without copying credential fields", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.prs.push({ number: 77, state: "open", user: { login: "legacy-bot", id: 90 },
    head: { ref: "docs-audit/old", sha: "e".repeat(40), repo: { id: 10, temp_clone_token: "fixture-sensitive-token" } },
    base: { ref: "main", repo: { id: 10, temp_clone_token: "fixture-sensitive-token" } } }); });
  const closure: Effect = { id: "close", kind: "pr-close", payload: { number: 77, expected_head: f.commit } };
  const observed = await f.transport.observe(f.plan, closure, f.objects);
  if (observed.state !== "conflict" || !observed.evidence) throw Error("missing native conflict evidence");
  const text = readFileSync(observed.evidence.path, "utf8");
  expect(JSON.parse(text).state).toBe("conflict");
  expect(text).toContain("e".repeat(40));
  expect(text).not.toContain("fixture-sensitive-token");
});

test("a rejected closure replay cannot retire an earlier sent request whose outcome remains unknown", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.prs.push({ number: 77, state: "open", user: { login: "legacy-bot", id: 90 },
    head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
  const effects: Effect[] = [f.plan.manifest.effects[0], f.plan.manifest.effects[1],
    { id: "explain", kind: "comment-create", payload: { number: 77, prior_ids: [], body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("explain") } },
    { id: "close", kind: "pr-close", payload: { number: 77, expected_head: f.commit } },
    { id: "release", kind: "lease-release", payload: { ref: f.settings.publication.lease_ref } }];
  const input = fixture(f.plan.manifest.bindings, effects);
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants,
    adoption_sha256: hash("adoption"), publication_kind: "advisory" as const, context: "trial", transport: "native", corrections: [], attention: [] });
  const repo = join(f.root, "source"), artifacts = join(f.root, "artifacts");
  let journal = createJournal({ source_repo: repo, artifact_root: artifacts, plan });
  const objects = writePublicationObjects(f.store, plan, journal.header);
  journal = appendIntent(journal, "lease");
  journal = await executeAttempt({ journal, effect: effects[0], objects, transport: f.transport });
  for (const effect of effects.slice(0, 3)) {
    if (effect.id === "explain") {
      journal = appendIntent(journal, effect.id);
      journal = await executeAttempt({ journal, effect, objects, transport: f.transport });
    }
    const observed = await f.transport.observe(plan, effect, objects);
    if (observed.state !== "done") throw Error("missing completed metadata/explanation");
    journal = appendOutcome(journal, effect.id, observed.outcome);
  }
  const closure = effects[3];
  journal = appendIntent(journal, closure.id);
  for (const code of [502, 403]) {
    f.update(state => { state.reject_http = code; });
    await expect(executeAttempt({ journal, effect: closure, objects, transport: f.transport })).rejects.toBeInstanceOf(PublicationExecutionError);
    journal = readJournal(journal.directory, repo);
  }
  expect(pendingAttempt(journal, closure)).toBeNull();
  expect(pendingAttempt(journal, closure, true)).toBe("dispatch-outcome-unknown");
  f.update(state => { state.reject_http = 0; });
  const cleanupOptions = { source_repo: repo, journal_directory: journal.directory, object_store: f.store, settings: f.settings,
    transport: f.transport, retire_effect_ids: [closure.id],
    authorize: async (scope: unknown) => ({ scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("actual selected cleanup request") }) };
  const refused = await reconcileAbsent(cleanupOptions);
  expect(refused.state).toBe("pending");
  expect(refused.journal.events.some(event => event.kind === "retired-absence")).toBe(false);
  expect(f.inspect().refs[f.settings.publication.lease_ref]).toBe(objects.lease_object);
  // The first accepted request can still arrive after the second request was rejected.
  f.update(state => { state.prs[0].state = "closed"; });
  const completed = await reconcileAbsent({ ...cleanupOptions, retire_effect_ids: [] });
  expect(completed.state).toBe("complete");
  expect(completed.journal.events.some(event => event.kind === "outcome" && event.effect_id === closure.id)).toBe(true);
  expect(f.inspect().refs[f.settings.publication.lease_ref]).toBeUndefined();
});

test("retirement rechecks every rejected attempt including the atomic receipt aliases", async () => {
  const f = setup(); await f.transport.identity();
  const selected = acquisition(f);
  let journal = appendIntent(selected.journal, selected.effect.id);
  f.update(state => { state.reject_git = true; });
  for (let count = 0; count < 2; count++) {
    await expect(executeAttempt({ journal, effect: selected.effect, objects: selected.objects, transport: f.transport })).rejects.toBeInstanceOf(PublicationExecutionError);
    journal = readJournal(journal.directory, join(f.root, "source"));
  }
  const receipt = journal.plan.manifest.effects[1];
  expect(pendingAttempt(journal, selected.effect, true)).toBeNull();
  expect(pendingAttempt(journal, receipt, true)).toBeNull();
  const oldest = journal.events.find(event => event.kind === "attempt-ended");
  if (!oldest || !("rejection" in oldest.payload) || !oldest.payload.rejection) throw Error("missing first rejection proof");
  writeFileSync(oldest.payload.rejection.path, "{}");
  expect(pendingAttempt(journal, selected.effect)).toBeNull();
  expect(pendingAttempt(journal, selected.effect, true)).toBe("rejection-proof-unavailable");
  expect(pendingAttempt(journal, receipt, true)).toBe("rejection-proof-unavailable");
});


test.each(["push-absent", "push-moved", "refresh-closed"] as const)("an exact owned PR head preserves historical push observation (%s)", scenario => {
  return (async () => {
    const f = setup(); await f.transport.identity();
    f.update(state => {
      state.prs.push({ number: 501, state: "closed", user: { login: "fixture-bot", id: 20 },
        head: { ref: "docs-drift/one", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } });
      if (scenario === "push-moved") state.refs["refs/heads/docs-drift/one"] = "f".repeat(40);
    });
    const effect: Effect = scenario === "refresh-closed"
      ? { id: "refresh", kind: "branch-refresh", payload: { number: 501, ref: "refs/heads/docs-drift/one", head: f.commit, expected_head: "e".repeat(40) } }
      : { id: "push", kind: "push", payload: { ref: "refs/heads/docs-drift/one", head: f.commit } };
    expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("done");
    f.update(state => { (state.prs[0].head as { sha: string }).sha = "e".repeat(40); });
    expect((await f.transport.observe(f.plan, effect, f.objects)).state).not.toBe("done");
    f.update(state => { (state.prs[0].head as { sha: string }).sha = f.commit; state.prs[0].user = { login: "other-bot", id: 99 }; });
    expect((await f.transport.observe(f.plan, effect, f.objects)).state).not.toBe("done");
  })();
});

test("an existing exact issue remains observable when its original evidence disappears", async () => {
  const f = setup(); await f.transport.identity();
  const issue: Effect = { id: "issue", kind: "issue-create", payload: { title: "Synthetic issue", labels: [], prior_ids: [],
    body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("issue") + "\nhttps://github.com/fixture/docs/blob/" + f.commit + "/README.md",
    evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.commit, evidence_sha256: sha256(f.readme) } };
  await f.transport.execute(f.plan, issue, f.objects);
  f.update(state => { state.tree_response.tree = []; });
  expect((await f.transport.observe(f.plan, issue, f.objects)).state).toBe("done");
  await expect(f.transport.execute(f.plan, issue, f.objects)).rejects.toBeInstanceOf(PublicationExecutionError);
  expect(f.inspect().issues).toHaveLength(1);
});

test("an existing exact explanation survives base retargeting while a new POST stays guarded", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.prs.push({ number: 77, state: "open", user: { login: "legacy-bot", id: 90 },
    head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
  const effect: Effect = { id: "explain", kind: "comment-create", payload: { number: 77, prior_ids: [],
    body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("explain") } };
  await f.transport.execute(f.plan, effect, f.objects);
  f.update(state => { (state.prs[0].base as { ref: string }).ref = "release"; });
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("done");
  await expect(f.transport.execute(f.plan, effect, f.objects)).rejects.toBeInstanceOf(PublicationExecutionError);
  expect(f.inspect().comments["77"]).toHaveLength(1);
});

test("lost-mirror cleanup observes merged deleted-branch delivery and existing issue/explanation without replay", async () => {
  const f = setup(); await f.transport.identity();
  const branch = "refs/heads/docs-drift/one";
  const effects: Effect[] = [f.plan.manifest.effects[0], f.plan.manifest.effects[1], f.plan.manifest.effects[2],
    { id: "pr", kind: "pr-create", payload: { base: "main", branch: "docs-drift/one", title: "Synthetic delivery", labels: [], draft: false,
      body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("pr") } },
    { id: "issue", kind: "issue-create", payload: { title: "Synthetic issue", labels: [], prior_ids: [],
      body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("issue") + "\nhttps://github.com/fixture/docs/blob/" + f.commit + "/README.md",
      evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.commit, evidence_sha256: sha256(f.readme) } },
    { id: "explain", kind: "comment-create", payload: { number: 77, prior_ids: [],
      body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("explain") } },
    { id: "release", kind: "lease-release", payload: { ref: f.settings.publication.lease_ref } }];
  const input = fixture(f.plan.manifest.bindings, effects), policy = { adoption_sha256: hash("adoption"), publication_kind: "advisory" as const,
    context: "production" as const, transport: "native" as const, pr_draft: false, worker: role, reviewer: role };
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, ...policy, corrections: [], attention: [] });
  const repo = join(f.root, "source"), artifacts = join(f.root, "artifacts");
  const original = createJournal({ source_repo: repo, artifact_root: artifacts, plan }), objects = writePublicationObjects(f.store, plan, original.header);
  const bytes = canonicalJSON(plan);
  f.update(state => {
    state.metadata_commit = { sha: objects.lease_object!, tree: { sha: objects.tree }, parents: [], message: "retained operation" };
    state.metadata_tree = { sha: objects.tree, truncated: false, tree: [{ path: "plan.json", mode: "100644", type: "blob", sha: objects.blob }] };
    state.metadata_blob = { sha: objects.blob, encoding: "base64", size: bytes.length, content: bytes.toString("base64") };
    state.prs.push({ number: 77, state: "open", user: { login: "legacy-bot", id: 90 },
      head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } });
  });
  for (const effect of effects.slice(0, -1)) {
    if (effect.kind !== "receipt-retain") await f.transport.execute(plan, effect, objects);
  }
  f.update(state => {
    const delivered = state.prs.find(pr => pr.number === 501)!; delivered.state = "closed"; delivered.merged = true;
    delete state.refs[branch]; state.tree_response.tree = []; (state.prs[0].base as { ref: string }).ref = "release";
  });
  rmSync(original.directory, { recursive: true });
  const restoredRoot = join(f.root, "fresh-host-artifacts"); mkdirSync(restoredRoot, { mode: 0o700 });
  const transport = createNativeTransport({ settings: f.settings, object_store: f.store, artifact_root: restoredRoot,
    source_repo: repo, credential: "synthetic-credential", path: join(f.root, "bin") + ":" + process.env.PATH });
  const inspection = await inspectRetainedOperation({ source_repo: repo, artifact_root: restoredRoot, settings: f.settings,
    transport, operation_id: "operation-1", verify_policy: () => policy });
  for (const id of ["push", "pr", "issue", "explain"]) {
    const selected = inspection.observations.find(item => item.effect_id === id);
    expect({ id, state: selected?.observation.state }).toEqual({ id, state: "done" });
  }
  const restored = await restoreRetainedOperation({ inspection, publication: { source_repo: repo, artifact_root: restoredRoot,
    object_store: f.store, settings: f.settings, plan, transport,
    gate: async () => { throw Error("original business proof unavailable"); } } });
  expect(restored.state).toBe("pending");
  const completed = await reconcileAbsent({ source_repo: repo, journal_directory: restored.journal.directory, object_store: f.store,
    settings: f.settings, transport, retire_effect_ids: [],
    authorize: async scope => ({ scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("actual owned metadata cleanup request") }) });
  expect(completed.state).toBe("complete");
  expect(f.inspect().refs[f.settings.publication.lease_ref]).toBeUndefined();
  expect(f.inspect().refs[branch]).toBeUndefined();
  expect(f.inspect().issues).toHaveLength(1); expect(f.inspect().comments["77"]).toHaveLength(1);
  expect(completed.journal.events.filter(event => event.kind === "attempt").map(event => event.effect_id)).toEqual(["release"]);
});

test("an unfinished retargeted refresh retains its destination guard", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => {
    state.refs["refs/heads/docs-drift/one"] = "e".repeat(40);
    state.prs.push({ number: 501, state: "open", user: { login: "fixture-bot", id: 20 },
      head: { ref: "docs-drift/one", sha: "e".repeat(40), repo: { id: 10 } }, base: { ref: "release", repo: { id: 10 } } });
  });
  const effect: Effect = { id: "refresh", kind: "branch-refresh", payload: { number: 501, ref: "refs/heads/docs-drift/one", expected_head: "e".repeat(40), head: f.commit } };
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("conflict");
});
