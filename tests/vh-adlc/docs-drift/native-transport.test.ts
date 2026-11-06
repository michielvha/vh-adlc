import { PublicationExecutionError } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createNativeTransport } from "../../../plugins/vh-adlc/scripts/docs-drift/transport";
import { effectMarker, validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { sealPlan, writePlanObject } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
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
  const input = fixture({ ...bindings, source_commit: commit, candidate_commit: commit, candidate_tree: tree });
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, adoption_sha256: hash("adoption"), context: "trial", transport: "native", corrections: [], attention: [] });
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
    issues: [] as Array<Record<string, unknown>>, comments: {} as Record<string, Array<Record<string, unknown>>>, refs: {} as Record<string, string>, prs: [] as Array<Record<string, unknown>>, race: false, forbidden: false, app_token: false, graphql_errors: false };
  writeFileSync(statePath, JSON.stringify(state));
  const program = `#!${process.execPath}
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const statePath = ${JSON.stringify(statePath)}, log = ${JSON.stringify(calls)};
const state = JSON.parse(readFileSync(statePath, 'utf8')), args = process.argv.slice(2);
appendFileSync(log, JSON.stringify({ program: process.argv[1].split('/').at(-1), args }) + '\\n');
const save = () => writeFileSync(statePath, JSON.stringify(state));
const option = name => args[args.indexOf(name) + 1];
if (process.argv[1].endsWith('/git')) {
    const lease = args.find(a => a.startsWith('--force-with-lease=')).slice(19), split = lease.lastIndexOf(':');
    const ref = lease.slice(0, split), expected = lease.slice(split + 1), target = args.at(-1), head = target.slice(0, target.indexOf(':'));
    if (state.race) {
        state.refs[ref] = 'f'.repeat(40);
        state.race = false;
        save();
    }
    if ((state.refs[ref] ?? '') !== expected)
        process.exit(1);
    if (head) {
        state.refs[ref] = head;
        for (const pr of state.prs)
            if ('refs/heads/' + pr.head.ref === ref)
                pr.head.sha = head;
    }
    else
        delete state.refs[ref];
    save();
    process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'create') {
    const branch = option('--head'), body = readFileSync(option('--body-file'), 'utf8');
    state.prs.push({ number: 501, state: 'open', title: args.find(a => a.startsWith('--title=')).slice(8), body, draft: args.includes('--draft'),
        labels: args.filter(a => a.startsWith('--label=')).map(a => ({ name: a.slice(8) })), user: { login: 'fixture-bot', id: 20 },
        base: { ref: 'main', repo: { id: 10 } }, head: { ref: branch, sha: state.refs['refs/heads/' + branch], repo: { id: 10 } } });
    save();
    process.exit(0);
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
else if (endpoint?.startsWith('repos/fixture/docs/pulls?'))
    value = state.prs;
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
  await f.transport.execute(f.plan, lease, f.objects, "attempt-native-lease");
  const artifacts = join(f.root, "artifacts");
  const ownerPath = readdirSync(artifacts).find(path => path.endsWith(".native-command.json"));
  if (!ownerPath) throw Error("missing native command owner record");
  const owner = JSON.parse(readFileSync(join(artifacts, ownerPath), "utf8"));
  expect(owner.effect_id).toBe("lease");
  expect(owner.attempt_id).toBe("attempt-native-lease");
  expect((await f.transport.observe(f.plan, lease, f.objects)).state).toBe("done");
  const calls = readFileSync(f.calls, "utf8");
  expect(calls).toContain('--force-with-lease=' + f.settings.publication.lease_ref + ':');
  expect(calls).not.toContain("synthetic-credential");
  expect(f.inspect().refs[f.settings.publication.lease_ref]).toBe(f.objects.object);
});

test("native atomic leases refuse a changed remote ref without replacing it", async () => {
  const f = setup(); await f.transport.identity(); f.update(state => { state.race = true; });
  const lease: Effect = { id: "lease", kind: "lease-acquire", payload: { ref: f.settings.publication.lease_ref } };
  const error = await f.transport.execute(f.plan, lease, f.objects).then(() => null, error => error);
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
  f.update(state => { state.issues[0].body = "edited"; });
  expect((await f.transport.observe(f.plan, issue, f.objects)).state).toBe("conflict");
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

test("removed issue markers stay ambiguous instead of becoming retryable absence", async () => {
  const f = setup(); await f.transport.identity();
  const body = publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("issue") + `\nhttps://github.com/fixture/docs/blob/${f.commit}/README.md`;
  const issue: Effect = { id: "issue", kind: "issue-create", payload: { title: "Selected issue", body, labels: [], prior_ids: [], evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.commit, evidence_sha256: sha256(f.readme) } };
  await f.transport.execute(f.plan, issue, f.objects);
  f.update(state => { state.issues[0].body = "marker removed"; });
  expect((await f.transport.observe(f.plan, issue, f.objects)).state).toBe("conflict");
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

test("removed explanation markers block a duplicate comment attempt", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.prs.push({ number: 77, state: "open", user: { login: "legacy-bot", id: 90 }, head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
  const comment: Effect = { id: "explain", kind: "comment-create", payload: { number: 77, body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("explain"), prior_ids: [] } };
  await f.transport.execute(f.plan, comment, f.objects);
  f.update(state => { state.comments["77"][0].body = "marker removed"; });
  expect((await f.transport.observe(f.plan, comment, f.objects)).state).toBe("conflict");
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
