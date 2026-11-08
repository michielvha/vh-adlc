import { readSuccess, retainSuccess } from "../../../plugins/vh-adlc/scripts/docs-drift/success";
import * as journalArtifacts from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { retainRejection, readRejection } from "../../../plugins/vh-adlc/scripts/docs-drift/rejections";
import { executeAttempt, pendingAttempt, PublicationExecutionError } from "../../../plugins/vh-adlc/scripts/docs-drift/attempts";
import { afterAll, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reconcileAbsent, inspectRetainedOperation, restoreRetainedOperation } from "../../../plugins/vh-adlc/scripts/docs-drift/recovery";
import { createNativeTransport } from "../../../plugins/vh-adlc/scripts/docs-drift/transport";
import { effectMarker, validateReviewedManifest, type Effect } from "../../../plugins/vh-adlc/scripts/docs-drift/manifests";
import { sealPlan, writePlanObject, createJournal, writePublicationObjects, appendIntent, appendOutcome, readJournal } from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { publicationMarker } from "../../../plugins/vh-adlc/scripts/docs-drift/report-history";
import { createOwnedObjectStore } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { readLookup } from "../../../plugins/vh-adlc/scripts/docs-drift/observations";
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
    ...defaults.manifest.effects.map(effect => effect.kind === "pr-create" ? { ...effect, payload: { ...effect.payload,
      body: String(effect.payload.body) + publicationMarker(settings, "operation-1") + "\n" + effectMarker(effect.id) } } : effect),
  ]);
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants, adoption_sha256: hash("adoption"), publication_kind: "advisory" as const, context: "trial", transport: "native", corrections: [], attention: [] });
  const objects = writePlanObject(store, plan);
  const statePath = join(root, "state.json"), calls = join(root, "calls.jsonl");
  const readme = readGit(repo, "show", "HEAD:README.md"), blobSha = readGit(repo, "rev-parse", "HEAD:README.md").toString().trim();
  const planBytes = canonicalJSON(plan);
  const state = { commit, tree, publication_commit: commit, repository_id: 10,
    metadata_commit: { sha: objects.object, tree: { sha: objects.tree }, parents: [] as Array<{ sha: string }>, message: "retained metadata" },
    metadata_tree: { sha: objects.tree, truncated: false, tree: [{ path: "plan.json", mode: "100644", type: "blob", sha: objects.blob }] },
    metadata_blob: { sha: objects.blob, encoding: "base64", size: planBytes.length, content: planBytes.toString("base64") },
    blob: { sha: blobSha, encoding: "base64", size: readme.length, content: readme.toString("base64") },
    tree_response: { sha: tree, truncated: false, tree: [{ path: "README.md", mode: "100644", type: "blob", sha: blobSha }] },
    issues: [] as Array<Record<string, unknown>>, comments: {} as Record<string, Array<Record<string, unknown>>>, refs: { "refs/heads/main": commit } as Record<string, string>, prs: [] as Array<Record<string, unknown>>, race: false, forbidden: false, app_token: false, graphql_errors: false, reject_git: false, reject_http: 0, partial_pr_error: false, reject_labels: false, response_creator_id: null as number | null, response_labels_missing: false, drop_labels: false, reject_ready: false, response_canary: false, evidence_commit: null as string | null, evidence_status: 0, source_status: 0, ref_status: 0, labels_unavailable: false, label_lookup_status: 0, label_list_status: 0, label_race: "none" as "none" | "rename" | "replace", label_race_done: false, label_non_label_response: false, labels: { documentation: { id: 101, name: "documentation" }, old: { id: 102, name: "old" }, other: { id: 103, name: "other" } } as Record<string, { id: number; name: string }> };
  writeFileSync(statePath, JSON.stringify(state));
  const program = `#!${process.execPath}
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const statePath = ${JSON.stringify(statePath)}, log = ${JSON.stringify(calls)};
const state = JSON.parse(readFileSync(statePath, 'utf8')), args = process.argv.slice(2);
appendFileSync(log, JSON.stringify({ program: process.argv[1].split('/').at(-1), args }) + '\\n');
const save = () => writeFileSync(statePath, JSON.stringify(state));
const option = name => args[args.indexOf(name) + 1];
const applyLabels = names => {
    if (state.drop_labels) return [];
    const seen = new Set();
    return names.map(name => state.labels[name] ?? { name }).filter(label => {
        const key = label.id ?? label.name;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};
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
if (args.includes('graphql')) {
    const response = { data: { viewer: { login: 'fixture-bot', databaseId: 20 } } };
    if (state.graphql_errors)
        response.errors = [{ message: 'denied' }];
    process.stdout.write(JSON.stringify(response));
    process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'ready') {
    if (state.reject_ready) process.exit(1);
    state.prs.find(pr => pr.number === Number(args[2])).draft = args.includes('--undo');
    save();
    process.exit(0);
}
const endpoint = args.find(a => a === 'user' || a.startsWith('repos/'));
const method = option('--method');
if (method !== 'GET') {
    const rejection = state.reject_http || (state.reject_labels && method === 'PUT' && endpoint.endsWith('/labels') ? 403 : 0);
    if (rejection) {
        process.stdout.write('HTTP/2.0 ' + rejection + ' rejected\\r\\nX-Secret: header-canary\\r\\n\\r\\n{"message":"body-canary"}');
        process.exit(1);
    }
    const payload = JSON.parse(readFileSync(option('--input'), 'utf8'));
    let returned;
    if (method === 'POST' && endpoint === 'repos/fixture/docs/pulls') {
        returned = { id: 901, number: 501, state: 'open', merged_at: null, title: payload.title, body: payload.body, draft: payload.draft,
            labels: [], user: { login: 'fixture-bot', id: state.response_creator_id ?? 20 },
            base: { ref: payload.base, sha: state.commit, repo: { id: 10 } },
            head: { ref: payload.head, sha: state.refs['refs/heads/' + payload.head], repo: { id: 10 } } };
        state.prs.push(returned);
    } else if (method === 'POST' && endpoint === 'repos/fixture/docs/issues') {
        returned = { ...payload, id: 801, number: 601, user: { login: 'fixture-bot', id: state.response_creator_id ?? 20 }, labels: applyLabels(payload.labels) };
        state.issues.push(returned);
    } else if (method === 'POST' && endpoint.endsWith('/comments')) {
        const number = endpoint.split('/').at(-2);
        returned = { id: 701, body: payload.body, issue_url: 'https://api.github.com/repos/fixture/docs/issues/' + number, user: { login: 'fixture-bot', id: 20 } };
        (state.comments[number] ??= []).push(returned);
    } else if (method === 'PATCH' && endpoint.includes('/pulls/')) {
        returned = Object.assign(state.prs.find(pr => pr.number === Number(endpoint.split('/').at(-1))), payload);
    } else if (method === 'PUT' && endpoint.endsWith('/labels')) {
        returned = applyLabels(payload.labels);
        state.prs.find(pr => pr.number === Number(endpoint.split('/').at(-2))).labels = returned;
    } else process.exit(1);
    save();
    if (state.partial_pr_error && method === 'POST' && endpoint.endsWith('/pulls')) process.exit(1);
    const output = state.response_canary && !Array.isArray(returned) ? { ...returned, opaque: 'response-body-canary' } : returned;
    process.stdout.write(args.includes('--jq') ? '{}' : 'HTTP/2.0 ' + (method === 'POST' ? 201 : 200) + ' OK\\r\\n' + (state.response_canary ? 'X-Secret: response-header-canary\\r\\n' : '') + '\\r\\n' + JSON.stringify(state.response_labels_missing && method === 'PUT' ? {} : output));
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
    value = { id: state.repository_id, full_name: 'fixture/docs', default_branch: 'main' };
else if (endpoint === 'repos/fixture/docs/git/commits/' + state.commit) {
    if (state.source_status) { status = state.source_status; value = { message: 'contents unavailable' }; }
    else value = { sha: state.commit, tree: { sha: state.tree }, parents: [], message: 'fixture' };
}
else if (endpoint === 'repos/fixture/docs/git/commits/' + state.publication_commit)
    value = { sha: state.publication_commit, tree: { sha: state.tree }, parents: [], message: 'publication head' };
else if (state.evidence_commit && endpoint === 'repos/fixture/docs/git/commits/' + state.evidence_commit) {
    if (state.evidence_status) { status = state.evidence_status; value = { message: 'evidence unavailable' }; }
    else value = { sha: state.evidence_commit, tree: { sha: state.tree }, parents: [], message: 'evidence fixture' };
}
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
    if (state.ref_status) {
        status = state.ref_status;
        value = { message: 'ref unavailable' };
    }
    else if (state.forbidden) {
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
else if (endpoint?.startsWith('repos/fixture/docs/labels?')) {
    if (state.label_list_status) { status = state.label_list_status; value = { message: 'label inventory unavailable' }; }
    else value = [...new Map(Object.values(state.labels).map(label => [label.id, label])).values()].map(label => ({ color: '123abc', default: false, ...label }));
}
else if (endpoint?.startsWith('repos/fixture/docs/labels/')) {
    const name = decodeURIComponent(endpoint.slice('repos/fixture/docs/labels/'.length));
    if (state.label_race !== 'none' && !state.label_race_done) {
        state.label_race_done = true;
        delete state.labels.documentation;
        delete state.labels.Documentation;
        state.labels.archived = { id: 101, name: 'archived' };
        for (const item of [...state.prs, ...state.issues])
            for (const label of item.labels ?? []) if (label.id === 101) label.name = 'archived';
        if (state.label_race === 'replace')
            state.labels.documentation = state.labels.Documentation = { id: 999, name: 'documentation' };
        save();
    }
    if (state.labels_unavailable) { status = 503; value = { message: 'label metadata unavailable' }; }
    else if (state.label_lookup_status) { status = state.label_lookup_status; value = { message: 'label lookup unavailable' }; }
    else if (state.label_non_label_response) value = { id: 101, name: 'documentation', default_branch: 'main' };
    else if (state.labels[name]) value = { color: '123abc', default: false, ...state.labels[name] };
    else { status = 404; value = { message: 'label absent' }; }
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
  f.update(state => { state.prs.push({ number: 77, state: "closed", merged_at: null, user: { login: "legacy-bot", id: 90 }, head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
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
  f.update(state => { state.prs.push({ number: 77, state: "open", merged_at: null, user: { login: "legacy-bot", id: 90 }, head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
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
  f.update(state => { state.prs.push({ ...original, labels: [{ id: 102, name: "old" }], number: 501, state: "open", user: { login: "fixture-bot", id: 20 }, head: { ref: "docs-drift/one", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
  const update: Effect = { id: "update", kind: "pr-update", payload: { number: 501, expected_head: f.commit, expected_payload_sha256: sha256(canonicalJSON(original)), expected_payload: original, title: "New title", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("update"), labels: ["documentation"], draft: true } };
  expect((await f.transport.observe(f.plan, update, f.objects)).state).toBe("absent");
  f.update(state => { state.prs[0].title = update.payload.title; state.prs[0].body = update.payload.body; });
  expect((await f.transport.observe(f.plan, update, f.objects)).state).toBe("absent");
  f.update(state => { state.prs[0].labels = [{ id: 101, name: "documentation" }]; });
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

function competingPublication(f: ReturnType<typeof setup>) {
  const artifacts = join(f.root, "competitor-artifacts"); mkdirSync(artifacts, { mode: 0o700 });
  const journal = createJournal({ source_repo: join(f.root, "source"), artifact_root: artifacts, plan: f.plan });
  return writePublicationObjects(f.store, f.plan, journal.header);
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
  const selected = acquisition(f), winner = competingPublication(f), server = realGitServer(f);
  expect(winner.receipt_object).not.toBe(selected.objects.receipt_object);
  const receipt = f.settings.publication.receipt_ref_prefix + "operation-1";
  readGit(f.store.root, "-c", "protocol.file.allow=always", "push", "--", server, winner.receipt_object + ":" + receipt);
  await expect(f.transport.execute(selected.plan, selected.effect, selected.objects)).rejects.toBeInstanceOf(PublicationExecutionError);
  expect(() => readGit(server, "rev-parse", "--verify", f.settings.publication.lease_ref)).toThrow();
  expect(readGit(server, "rev-parse", receipt).toString().trim()).toBe(winner.receipt_object);
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
  const retained = JSON.parse(proof.toString());
  const commandDirectory = retained.command_directory;
  expect(existsSync(join(commandDirectory, "stdout"))).toBe(false);
  expect(existsSync(join(commandDirectory, "stderr"))).toBe(false);
  const projectionPath = join(commandDirectory, "rejection-response.json");
  const projection = readFileSync(projectionPath);
  writeFileSync(projectionPath, "{}");
  expect(pendingAttempt(journal, selected.effect)).toBe("rejection-proof-unavailable");
  writeFileSync(projectionPath, projection);
  expect(pendingAttempt(journal, selected.effect)).toBeNull();
  // Exercise the old file-backed format independently of the new journal record.
  const ownerPath = join(f.root, "artifacts", commandDirectory.split("native-command-").pop() + ".native-command.json");
  const owner = JSON.parse(readFileSync(ownerPath, "utf8"));
  delete owner.capture;
  writeFileSync(ownerPath, canonicalJSON(owner));
  const updates = retained.protocol.updates as { ref: string; head: string | null }[];
  writeFileSync(join(commandDirectory, "stdout"), "To https://github.com/fixture/docs.git\n"
    + updates.map(item => `!\t${item.head ?? ""}:${item.ref}\t[rejected] (stale info)\n`).join("") + "Done\n", { mode: 0o600 });
  const scope = { artifact_root: join(f.root, "artifacts"), source_repo: join(f.root, "source"),
    plan: journal.plan, effect: selected.effect, attempt_id: retained.attempt_id };
  const legacy = retainRejection({ ...scope, command_directory: commandDirectory, protocol: retained.protocol });
  expect(readRejection({ ...scope, evidence: legacy })).toEqual(legacy);
  // Restore the new command's immutable bytes before using the original journal again.
  owner.capture = "projected-v2";
  writeFileSync(ownerPath, canonicalJSON(owner));
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
    if (error.rejection) {
      const proof = JSON.parse(readFileSync(error.rejection.path, "utf8"));
      expect(existsSync(join(proof.command_directory, "stdout"))).toBe(false);
      expect(existsSync(join(proof.command_directory, "stderr"))).toBe(false);
      const projection = readFileSync(join(proof.command_directory, "rejection-response.json"), "utf8");
      expect(projection).not.toContain("header-canary");
      expect(projection).not.toContain("body-canary");
    }
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
  const selected = acquisition(f), winner = competingPublication(f), server = realGitServer(f);
  expect(winner.receipt_object).not.toBe(selected.objects.receipt_object);
  const receipt = f.settings.publication.receipt_ref_prefix + "operation-1";
  readGit(f.store.root, "-c", "protocol.file.allow=always", "push", "--", server, winner.receipt_object + ":" + receipt);
  const error = await f.transport.execute(selected.plan, selected.effect, selected.objects, "real-rejected-atomic-push").then(() => null, error => error);
  expect(error).toBeInstanceOf(PublicationExecutionError);
  expect(error.rejection).toBeDefined();
  expect(() => readGit(server, "rev-parse", "--verify", f.settings.publication.lease_ref)).toThrow();
  expect(readGit(server, "rev-parse", receipt).toString().trim()).toBe(winner.receipt_object);
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
  f.update(state => { state.prs.push({ number: 77, state: "open", merged_at: null, user: { login: "legacy-bot", id: 90 },
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

test.each(["original-base", "retargeted"] as const)("lost-mirror inspection preserves an ambiguous live lease after observing completed delivery (%s)", async baseSelection => {
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
    if (baseSelection === "retargeted") (delivered.base as { ref: string }).ref = "release";
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
  expect(completed.state).toBe("pending");
  expect(completed.reason).toBe("inferred-publication-lease");
  expect(f.inspect().refs[f.settings.publication.lease_ref]).toBe(objects.lease_object);
  expect(f.inspect().refs[branch]).toBeUndefined();
  expect(f.inspect().issues).toHaveLength(1); expect(f.inspect().comments["77"]).toHaveLength(1);
  expect(completed.journal.events.filter(event => event.kind === "attempt").map(event => event.effect_id)).toEqual([]);
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


async function startCleanupJournal(f: ReturnType<typeof setup>, effects: Effect[]) {
  const selected = [f.plan.manifest.effects[0], f.plan.manifest.effects[1], ...effects,
    { id: "release", kind: "lease-release", payload: { ref: f.settings.publication.lease_ref } } satisfies Effect];
  const input = fixture(f.plan.manifest.bindings, selected);
  const plan = sealPlan({ reviewed: validateReviewedManifest(input), grants: input.grants,
    adoption_sha256: hash("adoption"), publication_kind: "resolve", context: "trial", transport: "native", corrections: [], attention: [] });
  const repo = join(f.root, "source");
  let journal = createJournal({ source_repo: repo, artifact_root: join(f.root, "artifacts"), plan });
  const objects = writePublicationObjects(f.store, plan, journal.header);
  journal = appendIntent(journal, "lease");
  journal = await executeAttempt({ journal, effect: selected[0], objects, transport: f.transport });
  for (const effect of selected.slice(0, 2)) {
    const observation = await f.transport.observe(plan, effect, objects);
    if (observation.state !== "done") throw Error("native metadata not completed");
    journal = appendOutcome(journal, effect.id, observation.outcome);
  }
  return { repo, journal, objects, plan };
}

test.each(["close", "update", "issue-missing", "issue-changed"] as const)("definitively changed unattempted target can be retired without execution (%s)", async scenario => {
  const f = setup(); await f.transport.identity();
  const originalPayload = { title: "Original title", body: "Original body", labels: [], draft: true };
  f.update(state => { state.prs.push({ ...originalPayload, number: 77, state: "open", user: { login: "fixture-bot", id: 20 },
    head: { ref: "docs-drift/one", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
  const body = publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("selected");
  const evidencePath = scenario === "issue-missing" ? "missing.md" : "README.md";
  const effect: Effect = scenario === "close" ? { id: "selected", kind: "pr-close", payload: { number: 77, expected_head: f.commit } }
    : scenario === "update" ? { id: "selected", kind: "pr-update", payload: { number: 77, expected_head: f.commit,
      expected_payload: originalPayload, expected_payload_sha256: sha256(canonicalJSON(originalPayload)), title: "Reviewed title", body, labels: [], draft: true } }
      : { id: "selected", kind: "issue-create", payload: { title: "Reviewed issue", body: body + "\nhttps://github.com/fixture/docs/blob/" + f.commit + "/" + evidencePath,
        labels: [], prior_ids: [], evidence_repository: "fixture/docs", evidence_path: evidencePath, evidence_commit: f.commit, evidence_sha256: scenario === "issue-changed" ? hash("different expected evidence") : sha256(f.readme) } };
  const selected = await startCleanupJournal(f, [effect]);
  f.update(state => {
    if (scenario === "close" || scenario === "update") (state.prs[0].base as { ref: string }).ref = "release";
  });
  expect((await f.transport.observe(selected.plan, effect, selected.objects)).state).toBe("conflict");
  const scopes: unknown[] = [];
  const completed = await reconcileAbsent({ source_repo: selected.repo, journal_directory: selected.journal.directory, object_store: f.store,
    settings: f.settings, transport: f.transport, retire_effect_ids: [effect.id], authorize: async scope => {
      scopes.push(scope);
      return { scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("actual changed-target retirement") };
    } });
  expect(completed.state).toBe("retired");
  expect(scopes.some(scope => typeof scope === "object" && scope !== null && Object.hasOwn(scope, "retirement"))).toBe(true);
  expect(f.inspect().refs[f.settings.publication.lease_ref]).toBeUndefined();
  expect(f.inspect().issues).toHaveLength(0);
  expect(f.inspect().prs[0].state).toBe("open");
});


test.each(["visible-404", "hidden-404", "403", "500", "malformed-blob"] as const)("evidence failures retain definitive versus unknown state (%s)", async failure => {
  const f = setup(); await f.transport.identity();
  const evidenceCommit = "e".repeat(40);
  f.update(state => { state.evidence_commit = evidenceCommit; });
  const effect: Effect = { id: "issue", kind: "issue-create", payload: { title: "Synthetic issue", labels: [], prior_ids: [],
    body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("issue") + "\nhttps://github.com/fixture/docs/blob/" + evidenceCommit + "/README.md",
    evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: evidenceCommit, evidence_sha256: sha256(f.readme) } };
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("absent");
  f.update(state => {
    if (failure === "malformed-blob") state.blob.content = Buffer.alloc(f.readme.length).toString("base64");
    else state.evidence_status = failure === "403" ? 403 : failure === "500" ? 500 : 404;
    if (failure === "hidden-404") state.source_status = 404;
  });
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe(failure === "visible-404" ? "conflict" : "unknown");
  expect(f.inspect().issues).toHaveLength(0);
});

test.each(["unsent", "rejected", "unknown", "unknown-then-rejected", "rejected-proof-changed"] as const)("conflict retirement accounts for the complete native attempt history (%s)", async history => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.prs.push({ number: 77, state: "open", user: { login: "legacy-bot", id: 90 },
    head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
  const effect: Effect = { id: "close", kind: "pr-close", payload: { number: 77, expected_head: f.commit } };
  const selected = await startCleanupJournal(f, [effect]);
  let journal = appendIntent(selected.journal, effect.id);
  if (history === "unsent") f.update(state => { (state.prs[0].base as { ref: string }).ref = "release"; });
  const statuses = history === "unsent" ? [0] : history.startsWith("rejected") ? [403] : history === "unknown" ? [502] : [502, 403];
  for (const status of statuses) {
    f.update(state => { state.reject_http = status; });
    await expect(executeAttempt({ journal, effect, objects: selected.objects, transport: f.transport })).rejects.toBeInstanceOf(PublicationExecutionError);
    journal = readJournal(journal.directory, selected.repo);
  }
  f.update(state => { state.reject_http = 0; (state.prs[0].base as { ref: string }).ref = "release"; });
  const result = await reconcileAbsent({ source_repo: selected.repo, journal_directory: journal.directory, object_store: f.store,
    settings: f.settings, transport: f.transport, retire_effect_ids: [effect.id],
    authorize: async scope => {
      if (history === "rejected-proof-changed" && scope.retirement) {
        const ending = journal.events.findLast(event => event.kind === "attempt-ended" && event.effect_id === effect.id);
        if (!ending || !("rejection" in ending.payload) || !ending.payload.rejection) throw Error("missing native rejection proof");
        writeFileSync(ending.payload.rejection.path, "changed during approval");
      }
      return { scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("explicit exact unapplied target retirement") };
    } });
  const retirable = history === "unsent" || history === "rejected";
  expect(result.state).toBe(retirable ? "retired" : "pending");
  expect(f.inspect().prs[0].state).toBe("open");
  expect(f.inspect().refs[f.settings.publication.lease_ref] === undefined).toBe(retirable);
});


test("unrelated PR inventory cannot hide an exact existing operation payload", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.refs["refs/heads/docs-drift/one"] = f.commit; });
  const effect = f.plan.manifest.effects.find(item => item.kind === "pr-create")!;
  await f.transport.execute(f.plan, effect, f.objects);
  f.update(state => { state.prs.push({ ...state.prs[0], number: 502, body: "Unrelated owned PR body" }); });
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("done");
  expect(f.inspect().prs).toHaveLength(2);
});

test.each(["missing-body", "duplicate-number"] as const)("incomplete PR inventory cannot hide behind one exact positive match (%s)", invalid => {
  return (async () => {
    const f = setup(); await f.transport.identity();
    f.update(state => { state.refs["refs/heads/docs-drift/one"] = f.commit; });
    const effect = f.plan.manifest.effects.find(item => item.kind === "pr-create")!;
    await f.transport.execute(f.plan, effect, f.objects);
    f.update(state => {
      const other: Record<string, unknown> = { ...state.prs[0], number: invalid === "duplicate-number" ? 501 : 502, body: "Unrelated body" };
      if (invalid === "missing-body") delete other.body;
      state.prs.push(other);
    });
    expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("unknown");
  })();
});


test.each(["pr-create", "issue-create", "pr-update"] as const)("server-canonical labels preserve the reviewed %s payload", async kind => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.labels.Documentation = state.labels.documentation; state.refs["refs/heads/docs-drift/one"] = f.commit; });
  const body = publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("selected");
  const original = { title: "Old title", body: "Old body", labels: ["old"], draft: false };
  if (kind === "pr-update") f.update(state => { state.prs.push({ ...original, labels: [{ id: 102, name: "old" }], number: 501, state: "open",
    user: { login: "fixture-bot", id: 20 }, head: { ref: "docs-drift/one", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
  const common = { title: "Reviewed title", body, labels: ["Documentation"], draft: true };
  const effect: Effect = kind === "pr-create" ? { id: "selected", kind, payload: { ...common, base: "main", branch: "docs-drift/one" } }
    : kind === "pr-update" ? { id: "selected", kind, payload: { ...common, number: 501, expected_head: f.commit,
      expected_payload: original, expected_payload_sha256: sha256(canonicalJSON(original)) } }
      : { id: "selected", kind, payload: { title: common.title, body: body + "\nhttps://github.com/fixture/docs/blob/" + f.commit + "/README.md",
        labels: common.labels, prior_ids: [], evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.commit, evidence_sha256: sha256(f.readme) } };
  const reviewed = canonicalJSON(effect);
  await f.transport.execute(f.plan, effect, f.objects);
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("done");
  expect(canonicalJSON(effect)).toEqual(reviewed);
  {
    let sentLabels: unknown;
    for (const name of readdirSync(join(f.root, "artifacts"))) {
      if (!name.startsWith("native-command-")) continue;
      const path = join(f.root, "artifacts", name, "payload.json");
      if (!existsSync(path)) continue;
      const payload: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (payload !== null && typeof payload === "object" && Object.hasOwn(payload, "labels")) sentLabels = Reflect.get(payload, "labels");
    }
    expect(sentLabels).toEqual(["Documentation"]);
  }
  f.update(state => { (kind === "issue-create" ? state.issues[0] : state.prs[0]).labels = [{ id: 101, name: "documentation" }, { id: 103, name: "other" }]; });
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("conflict");
});

test.each([["DÖCS", "döcs"], ["Docs/API", "docs/api"], ["Σ", "ς"]])("native label identity resolves %s without local case assumptions", async (requested, canonical) => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.labels[requested] = state.labels[canonical] = { id: 201, name: canonical }; });
  const effect: Effect = { id: "issue", kind: "issue-create", payload: { title: "Reviewed issue", labels: [requested], prior_ids: [],
    body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("issue") + "\nhttps://github.com/fixture/docs/blob/" + f.commit + "/README.md",
    evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.commit, evidence_sha256: sha256(f.readme) } };
  await f.transport.execute(f.plan, effect, f.objects);
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("done");
  expect(effect.payload.labels).toEqual([requested]);
  f.update(state => { state.labels_unavailable = true; });
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("unknown");
  f.update(state => { state.labels_unavailable = false; Object.assign(state.labels[requested], { id: "malformed" }); });
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("unknown");
});

test("multiple reviewed aliases of one label preserve assignment-set semantics", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.labels.Documentation = state.labels.documentation; state.refs["refs/heads/docs-drift/one"] = f.commit; });
  const effect: Effect = { id: "pr", kind: "pr-create", payload: { title: "Reviewed PR", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("pr"),
    labels: ["Documentation", "documentation"], draft: true, base: "main", branch: "docs-drift/one" } };
  await f.transport.execute(f.plan, effect, f.objects);
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("done");
  expect(f.inspect().prs[0].labels).toEqual([{ id: 101, name: "documentation" }]);
  expect(effect.payload.labels).toEqual(["Documentation", "documentation"]);
});


test.each(["rename", "replace"] as const)("label resolution keeps the native resource snapshot through a concurrent %s", async race => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.labels.Documentation = state.labels.documentation; state.refs["refs/heads/docs-drift/one"] = f.commit; });
  const effect: Effect = { id: "pr", kind: "pr-create", payload: { title: "Reviewed PR", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("pr"),
    labels: ["Documentation"], draft: true, base: "main", branch: "docs-drift/one" } };
  await f.transport.execute(f.plan, effect, f.objects);
  f.update(state => { state.label_race = race; });
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("conflict");
});

test.each([false, true])("a deleted original label requires label-surface visibility before conflict retirement (hidden=%s)", async hidden => {
  const f = setup(); await f.transport.identity();
  const original = { title: "Old title", body: "Old body", labels: ["old", "other"], draft: true };
  f.update(state => { state.prs.push({ ...original, labels: [{ id: 102, name: "old" }, { id: 103, name: "other" }], number: 77, state: "open",
    user: { login: "fixture-bot", id: 20 }, head: { ref: "docs-drift/one", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } }); });
  const effect: Effect = { id: "update", kind: "pr-update", payload: { number: 77, expected_head: f.commit, expected_payload: original,
    expected_payload_sha256: sha256(canonicalJSON(original)), title: "Reviewed title", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("update"), labels: ["documentation"], draft: true } };
  const selected = await startCleanupJournal(f, [effect]);
  f.update(state => { delete state.labels.old; state.prs[0].labels = [{ id: 103, name: "other" }]; if (hidden) state.label_list_status = 403; });
  expect((await f.transport.observe(selected.plan, effect, selected.objects)).state).toBe(hidden ? "unknown" : "conflict");
  const result = await reconcileAbsent({ source_repo: selected.repo, journal_directory: selected.journal.directory, object_store: f.store,
    settings: f.settings, transport: f.transport, retire_effect_ids: [effect.id],
    authorize: async scope => ({ scope_sha256: sha256(canonicalJSON(scope)), request_sha256: hash("current deleted-label cleanup approval") }) });
  expect(result.state).toBe(hidden ? "pending" : "retired");
  expect(f.inspect().refs[f.settings.publication.lease_ref] === undefined).toBe(!hidden);
  expect(f.inspect().prs[0].title).toBe("Old title");
});

test("alias outcome retains its exact snapshot and expected-name resolution evidence", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.labels.Documentation = state.labels.documentation; state.refs["refs/heads/docs-drift/one"] = f.commit; });
  const effect: Effect = { id: "pr", kind: "pr-create", payload: { title: "Reviewed PR", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("pr"),
    labels: ["Documentation"], draft: true, base: "main", branch: "docs-drift/one" } };
  await f.transport.execute(f.plan, effect, f.objects);
  const result = await f.transport.observe(f.plan, effect, f.objects);
  expect(result.state).toBe("done");
  if (result.state !== "done" || !result.outcome.lookup) throw Error("missing alias support lookup");
  const support = readLookup({ evidence: result.outcome.lookup, artifact_root: join(f.root, "artifacts"), source_repo: join(f.root, "source"),
    plan: f.plan, effect, transport: "native", state: "done" });
  expect(result.outcome.observation_sha256).toBe(support.sha256);
  const retained: unknown = JSON.parse(readFileSync(support.path, "utf8"));
  expect(retained).toMatchObject({ state: "done", lookup: { label_comparisons: [{ observed: [{ id: 101, name: "documentation" }],
    expected: [{ requested: "Documentation", id: 101, canonical: "documentation" }] }] } });
  expect(readFileSync(f.calls, "utf8")).not.toContain('"repos/fixture/docs/labels/documentation"');
});

test("a dot-segment lookup cannot treat repository metadata as a label identity", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.refs["refs/heads/docs-drift/one"] = f.commit; });
  const effect: Effect = { id: "pr", kind: "pr-create", payload: { title: "Reviewed PR", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("pr"),
    labels: [".."], draft: true, base: "main", branch: "docs-drift/one" } };
  await f.transport.execute(f.plan, effect, f.objects);
  f.update(state => { state.prs[0].labels = [{ id: 101, name: "documentation" }]; state.label_non_label_response = true; });
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("unknown");
  expect(readFileSync(f.calls, "utf8")).toContain("repos/fixture/docs/labels/%2E%2E");
});


test.each(["missing", "duplicate", "invalid"] as const)("native label snapshots reject %s identities even when names match", async kind => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.refs["refs/heads/docs-drift/one"] = f.commit; });
  const effect: Effect = { id: "pr", kind: "pr-create", payload: { title: "Reviewed PR", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("pr"),
    labels: ["documentation", "other"], draft: true, base: "main", branch: "docs-drift/one" } };
  await f.transport.execute(f.plan, effect, f.objects);
  f.update(state => {
    state.prs[0].labels = kind === "missing" ? [{ name: "documentation" }, { id: 103, name: "other" }]
      : [{ id: kind === "invalid" ? -1 : 101, name: "documentation" }, { id: 101, name: "other" }];
  });
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("unknown");
});


test.each(["done", "absent", "conflict"] as const)("retained %s lookup evidence includes only current observation requests", async state => {
  const f = setup(); await f.transport.identity();
  f.update(value => { value.labels.Documentation = value.labels.documentation; value.refs["refs/heads/docs-drift/one"] = f.commit; });
  const effect: Effect = { id: "pr", kind: "pr-create", payload: { title: "Reviewed PR", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("pr"),
    labels: ["Documentation"], draft: true, base: "main", branch: "docs-drift/one" } };
  if (state !== "absent") await f.transport.execute(f.plan, effect, f.objects);
  if (state === "conflict") f.update(value => { value.prs[0].labels = [{ id: 103, name: "other" }]; });
  async function lookup() {
    const result = await f.transport.observe(f.plan, effect, f.objects);
    expect(result.state).toBe(state);
    const support = result.state === "done" ? result.outcome.lookup
      : result.state === "absent" || result.state === "conflict" ? result.evidence : undefined;
    if (!support) throw Error("missing native lookup evidence");
    const retained: { lookup: { requests: { endpoint: string }[]; label_comparisons: unknown[] } } = JSON.parse(readFileSync(support.path, "utf8"));
    return retained.lookup;
  }
  const first = await lookup(), second = await lookup();
  expect(first.requests.map(request => request.endpoint)).not.toContain("repos/fixture/docs/git/commits/" + f.commit);
  expect(second.requests.map(request => request.endpoint)).toEqual(first.requests.map(request => request.endpoint));
  expect(first.label_comparisons).toEqual(state === "absent" ? [] : [{ observed: [{ id: state === "done" ? 101 : 103, name: state === "done" ? "documentation" : "other" }],
    expected: [{ requested: "Documentation", id: 101, canonical: "documentation" }], matched: state === "done" }]);
});


test.each(["source", "target"] as const)("PR update %s evidence attributes only the evaluated label comparisons", async state => {
  const f = setup(); await f.transport.identity();
  const common = { title: "Reviewed update", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("update"), draft: true };
  const original = { ...common, labels: ["Old"] };
  f.update(value => {
    value.labels.Documentation = value.labels.documentation; value.labels.Old = value.labels.old;
    value.prs.push({ ...common, labels: state === "source" ? [{ id: 102, name: "old" }] : [{ id: 101, name: "documentation" }], number: 77, state: "open",
      user: { login: "fixture-bot", id: 20 }, head: { ref: "docs-drift/one", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } });
  });
  const effect: Effect = { id: "update", kind: "pr-update", payload: { ...common, labels: ["Documentation"], number: 77, expected_head: f.commit,
    expected_payload: original, expected_payload_sha256: sha256(canonicalJSON(original)) } };
  async function lookup() {
    const result = await f.transport.observe(f.plan, effect, f.objects);
    expect(result.state).toBe(state === "source" ? "absent" : "done");
    const support = result.state === "done" ? result.outcome.lookup : result.state === "absent" ? result.evidence : undefined;
    if (!support) throw Error("missing update lookup evidence");
    readLookup({ evidence: support, artifact_root: join(f.root, "artifacts"), source_repo: join(f.root, "source"), plan: f.plan, effect,
      transport: "native", state: state === "source" ? "absent" : "done" });
    const retained: { lookup: { requests: { endpoint: string }[]; label_comparisons: unknown[] } } = JSON.parse(readFileSync(support.path, "utf8"));
    return retained.lookup;
  }
  const first = await lookup(), second = await lookup();
  const observed = state === "source" ? [{ id: 102, name: "old" }] : [{ id: 101, name: "documentation" }];
  const comparisons = [{ observed, expected: [{ requested: "Documentation", id: 101, canonical: "documentation" }], matched: state === "target" }];
  if (state === "source") comparisons.push({ observed, expected: [{ requested: "Old", id: 102, canonical: "old" }], matched: true });
  expect(first.label_comparisons).toEqual(comparisons);
  expect(second.label_comparisons).toEqual(comparisons);
  expect(first.requests.map(request => request.endpoint)).not.toContain("repos/fixture/docs/git/commits/" + f.commit);
  expect(second.requests.map(request => request.endpoint)).toEqual(first.requests.map(request => request.endpoint));
});

test("issue-create alias evidence retains only its successful current comparison", async () => {
  const f = setup(); await f.transport.identity();
  f.update(value => { value.labels.Documentation = value.labels.documentation; });
  const effect: Effect = { id: "issue", kind: "issue-create", payload: { title: "Reviewed issue", labels: ["Documentation"], prior_ids: [],
    body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("issue") + "\nhttps://github.com/fixture/docs/blob/" + f.commit + "/README.md",
    evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.commit, evidence_sha256: sha256(f.readme) } };
  await f.transport.execute(f.plan, effect, f.objects);
  async function lookup() {
    const result = await f.transport.observe(f.plan, effect, f.objects);
    expect(result.state).toBe("done");
    if (result.state !== "done" || !result.outcome.lookup) throw Error("missing issue lookup evidence");
    const support = readLookup({ evidence: result.outcome.lookup, artifact_root: join(f.root, "artifacts"), source_repo: join(f.root, "source"),
      plan: f.plan, effect, transport: "native", state: "done" });
    const retained: { lookup: { requests: { endpoint: string }[]; label_comparisons: unknown[] } } = JSON.parse(readFileSync(support.path, "utf8"));
    return retained.lookup;
  }
  const first = await lookup(), second = await lookup();
  const comparisons = [{ observed: [{ id: 101, name: "documentation" }], expected: [{ requested: "Documentation", id: 101, canonical: "documentation" }], matched: true }];
  expect(first.label_comparisons).toEqual(comparisons);
  expect(second.label_comparisons).toEqual(comparisons);
  expect(first.requests.map(request => request.endpoint)).not.toContain("repos/fixture/docs/git/commits/" + f.commit);
  expect(second.requests.map(request => request.endpoint)).toEqual(first.requests.map(request => request.endpoint));
});


test.each(["lease-acquire", "receipt-retain", "lease-release", "push"] as const)("%s cannot reuse earlier contents visibility after access loss", async kind => {
  const f = setup(); await f.transport.identity();
  const ref = kind === "push" ? "refs/heads/docs-drift/missing" : kind === "receipt-retain" ? f.settings.publication.receipt_ref_prefix + "operation-1" : f.settings.publication.lease_ref;
  f.update(value => { value.refs[ref] = f.commit; value.source_status = 404; value.ref_status = 404; });
  const effect: Effect = { id: "selected", kind, payload: { ref, ...(kind === "push" ? { head: f.commit } : {}) } };
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("unknown");
  await expect(f.transport.ref(ref)).rejects.toThrow();
  expect(f.inspect().refs[ref]).toBe(f.commit);
});

test.each(["lease-release", "receipt-retain"] as const)("%s retains fresh access proof for a visible ref absence", async kind => {
  const f = setup(); await f.transport.identity();
  const ref = kind === "receipt-retain" ? f.settings.publication.receipt_ref_prefix + "operation-1" : f.settings.publication.lease_ref;
  const effect: Effect = { id: "selected", kind, payload: { ref } };
  const result = await f.transport.observe(f.plan, effect, f.objects);
  expect(result.state).toBe(kind === "lease-release" ? "done" : "absent");
  const support = result.state === "done" ? result.outcome.lookup : result.state === "absent" ? result.evidence : undefined;
  if (!support) throw Error("missing fresh ref absence support");
  readLookup({ evidence: support, artifact_root: join(f.root, "artifacts"), source_repo: join(f.root, "source"), plan: f.plan, effect,
    transport: "native", state: kind === "lease-release" ? "done" : "absent" });
  const retained: { lookup: { requests: { endpoint: string; status: number }[] } } = JSON.parse(readFileSync(support.path, "utf8"));
  expect(retained.lookup.requests.map(({ endpoint, status }) => ({ endpoint, status }))).toEqual([
    { endpoint: "repos/fixture/docs/git/ref/" + ref.slice("refs/".length), status: 404 },
    { endpoint: "repos/fixture/docs", status: 200 },
    { endpoint: "repos/fixture/docs/git/ref/heads/main", status: 200 },
    { endpoint: "repos/fixture/docs/git/commits/" + f.commit, status: 200 },
  ]);
});

test.each(["alias-target", "empty-target", "empty-done"] as const)("PR update retains exact-name and empty comparison evidence (%s)", async kind => {
  const f = setup(); await f.transport.identity();
  const common = { title: "Reviewed update", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("update"), draft: true };
  const original = { ...common, labels: ["old"] };
  const observed = kind === "empty-done" ? [] : [{ id: 102, name: "old" }];
  f.update(value => {
    value.labels.Documentation = value.labels.documentation;
    value.prs.push({ ...common, labels: observed, number: 77, state: "open", user: { login: "fixture-bot", id: 20 },
      head: { ref: "docs-drift/one", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } });
  });
  const effect: Effect = { id: "update", kind: "pr-update", payload: { ...common, labels: kind === "alias-target" ? ["Documentation"] : [],
    number: 77, expected_head: f.commit, expected_payload: original, expected_payload_sha256: sha256(canonicalJSON(original)) } };
  const result = await f.transport.observe(f.plan, effect, f.objects);
  expect(result.state).toBe(kind === "empty-done" ? "done" : "absent");
  const support = result.state === "done" ? result.outcome.lookup : result.state === "absent" ? result.evidence : undefined;
  if (!support) throw Error("missing exact or empty comparison support");
  const retained: { lookup: { label_comparisons: unknown[] } } = JSON.parse(readFileSync(support.path, "utf8"));
  const expected = [{ observed, expected: kind === "alias-target" ? [{ requested: "Documentation", id: 101, canonical: "documentation" }] : [], matched: kind === "empty-done" }];
  if (kind !== "empty-done") expected.push({ observed, expected: [{ requested: "old", id: 102, canonical: "old" }], matched: true });
  expect(retained.lookup.label_comparisons).toEqual(expected);
});


test("native visibility follows publication history when the scratch source is absent there", async () => {
  const f = setup(), publication = "b".repeat(40);
  f.update(value => { value.publication_commit = publication; value.refs["refs/heads/main"] = publication; value.source_status = 404;
    value.evidence_commit = "d".repeat(40); value.evidence_status = 404; });
  expect((await f.transport.identity()).repository_id).toBe(10);
  expect(await f.transport.ref(f.settings.publication.lease_ref)).toEqual({ state: "absent" });
  const issue: Effect = { id: "issue", kind: "issue-create", payload: { title: "Reviewed issue", labels: [], prior_ids: [],
    body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("issue") + "\nhttps://github.com/fixture/docs/blob/" + "d".repeat(40) + "/README.md",
    evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: "d".repeat(40), evidence_sha256: sha256(f.readme) } };
  expect((await f.transport.observe(f.plan, issue, f.objects)).state).toBe("conflict");
  expect(readFileSync(f.calls, "utf8")).not.toContain('"repos/fixture/docs/git/commits/' + f.commit + '"');
});

test("a same-name replacement repository cannot supply retained ref absence", async () => {
  const f = setup(); await f.transport.identity();
  f.update(value => { value.repository_id = 11; });
  const effect: Effect = { id: "release", kind: "lease-release", payload: { ref: f.settings.publication.lease_ref } };
  expect((await f.transport.observe(f.plan, effect, f.objects)).state).toBe("unknown");
  await expect(f.transport.ref(f.settings.publication.lease_ref)).rejects.toThrow();
});

test.each(["merged", "unmerged", "missing", "malformed"] as const)("closure recovery distinguishes a %s PR merge state", async state => {
  const f = setup(); await f.transport.identity();
  f.update(value => { const pr: Record<string, unknown> = { number: 77, state: "closed", user: { login: "legacy-bot", id: 90 },
    head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", repo: { id: 10 } } };
    if (state !== "missing") pr.merged_at = state === "merged" ? "2026-11-07T00:00:00Z" : state === "unmerged" ? null : 7;
    value.prs.push(pr); });
  const effect: Effect = { id: "close", kind: "pr-close", payload: { number: 77, expected_head: f.commit } };
  const result = await f.transport.observe(f.plan, effect, f.objects);
  expect(result.state).toBe(state === "merged" ? "conflict" : state === "unmerged" ? "done" : "unknown");
  if (state === "merged") expect(result).toMatchObject({ reason: "native-PR-merged" });
});

test("native rejection proof links only after durable command artifacts", async () => {
  const f = setup(); await f.transport.identity();
  const selected = acquisition(f);
  f.update(state => { state.reject_git = true; });
  const paths: string[] = [];
  const publish = journalArtifacts.publishArtifact;
  const observed = spyOn(journalArtifacts, "publishArtifact").mockImplementation((path, bytes) => {
    paths.push(path);
    publish(path, bytes);
  });
  try {
    await expect(f.transport.execute(selected.plan, selected.effect, selected.objects, "durable-attempt")).rejects.toBeInstanceOf(PublicationExecutionError);
    const owner = paths.findIndex(path => path.endsWith(".native-command.json"));
    const status = paths.findIndex(path => path.endsWith("/process.json"));
    const projection = paths.findIndex(path => path.endsWith("/rejection-response.json"));
    const proof = paths.findIndex(path => /\/rejection-[a-f0-9-]+\.json$/u.test(path));
    expect(owner).toBeGreaterThanOrEqual(0);
    expect(status).toBeGreaterThan(owner);
    expect(projection).toBeGreaterThan(status);
    expect(proof).toBeGreaterThan(projection);
  } finally { observed.mockRestore(); }
});

test("successful native issue delivery returns attempt-bound private evidence", async () => {
  const f = setup(); await f.transport.identity();
  const effect: Effect = { id: "captured-issue", kind: "issue-create", payload: {
    title: "Captured title", body: "Captured body\nhttps://github.com/fixture/docs/blob/" + f.commit + "/README.md",
    labels: ["documentation"], prior_ids: [], evidence_repository: "fixture/docs", evidence_path: "README.md",
    evidence_commit: f.commit, evidence_sha256: sha256(f.readme),
  } };
  const reviewed = fixture(f.plan.manifest.bindings, [...f.plan.manifest.effects.slice(0, 2), effect, f.plan.manifest.effects.at(-1)!]);
  const plan = sealPlan({ reviewed: validateReviewedManifest(reviewed), grants: reviewed.grants, adoption_sha256: hash("adoption"),
    publication_kind: "advisory", context: "trial", transport: "native", corrections: [], attention: [] });
  const objects = writePlanObject(f.store, plan);
  const result = await f.transport.execute(plan, effect, objects, "captured-attempt");
  expect(result).toBeDefined();
  if (!result) throw Error("missing captured execution");
  expect(result.successes).toHaveLength(1);
  const proof = result.successes[0];
  const bytes = readFileSync(proof.path);
  expect(sha256(bytes)).toBe(proof.sha256);
  const projection = JSON.parse(bytes.toString()) as {
    attempt_id: string; status: number; command_index: number; context: string; command_directory: string;
    identity: { actor_id: number; actor: string; repository_id: number }; facts: { body_sha256: string; labels: number[] }; method: string; endpoint: string; extra?: boolean;
  };
  expect(projection.attempt_id).toBe("captured-attempt");
  expect(projection.facts.body_sha256).toBe(sha256(Buffer.from(String(effect.payload.body))));
  expect(projection.facts.labels).toEqual([101]);
  expect(projection.identity.actor_id).toBe(20);
  expect(bytes.toString()).not.toContain("Captured title");
  expect(bytes.toString()).not.toContain("Captured body");
  const scope = { artifact_root: join(f.root, "artifacts"), source_repo: join(f.root, "source"), plan, effect, attempt_id: "captured-attempt" };
  expect(readSuccess({ ...scope, evidence: proof })).toEqual(proof);
  expect(() => readSuccess({ ...scope, attempt_id: "foreign-attempt", evidence: proof })).toThrow();
  expect(() => readSuccess({ ...scope, effect: { ...effect, id: "foreign-effect" }, evidence: proof })).toThrow();
  const invalid: Array<(value: typeof projection) => void> = [
    value => { value.status = 500; }, value => { value.command_index = -1; },
    value => { value.identity.actor_id = 0; }, value => { value.identity.actor_id = 21; },
    value => { value.identity.actor = "foreign-bot"; }, value => { value.identity.repository_id = 11; },
    value => { value.endpoint = "repos/fixture/docs/pulls/44"; }, value => { value.method = "PATCH"; },
    value => { value.facts.labels = [101, 101]; },
    value => { value.facts.body_sha256 = "unhashed"; }, value => { value.extra = true; },
    value => { value.context = "production"; },
  ];
  for (const change of invalid) {
    const changed = JSON.parse(bytes.toString()); change(changed);
    const changedBytes = canonicalJSON(changed);
    writeFileSync(proof.path, changedBytes);
    expect(() => readSuccess({ ...scope, evidence: { path: proof.path, sha256: sha256(changedBytes) } })).toThrow();
  }
  writeFileSync(proof.path, bytes);
  for (const path of [join(projection.command_directory, "payload.json"), join(projection.command_directory, "process.json")]) {
    const original = readFileSync(path);
    writeFileSync(path, "{}");
    expect(() => readSuccess({ ...scope, evidence: proof })).toThrow();
    writeFileSync(path, original);
  }

  writeFileSync(proof.path, "{}");
  expect(() => readSuccess({ ...scope, evidence: proof })).toThrow();
});

for (const corrupt of [false, true, "mismatched-response"] as const) {
test(`the original journal retains honest process status (corrupt=${corrupt})`, async () => {
  const f = setup(); await f.transport.identity();
  const effect: Effect = { id: "captured-issue", kind: "issue-create", payload: {
    title: "Captured title", body: "Captured body\nhttps://github.com/fixture/docs/blob/" + f.commit + "/README.md",
    labels: ["documentation"], prior_ids: [], evidence_repository: "fixture/docs", evidence_path: "README.md",
    evidence_commit: f.commit, evidence_sha256: sha256(f.readme),
  } };
  const reviewed = fixture(f.plan.manifest.bindings, [...f.plan.manifest.effects.slice(0, 2), effect, f.plan.manifest.effects.at(-1)!]);
  const plan = sealPlan({ reviewed: validateReviewedManifest(reviewed), grants: reviewed.grants, adoption_sha256: hash("adoption"),
    publication_kind: "advisory", context: "trial", transport: "native", corrections: [], attention: [] });
  let journal = createJournal({ source_repo: join(f.root, "source"), artifact_root: join(f.root, "artifacts"), plan });
  const objects = writePublicationObjects(f.store, plan, journal.header);
  // Seed the prior metadata outcomes as fixture preconditions for this isolated business attempt.
  for (const metadata of plan.manifest.effects.slice(0, 2)) {
    journal = appendIntent(journal, metadata.id);
    journal = appendOutcome(journal, metadata.id, { state: "observed", observation_sha256: hash("fixture-metadata"),
      resource_id: String(metadata.payload.ref), object: objects.lease_object });
  }
  journal = appendIntent(journal, effect.id);
  if (corrupt === "mismatched-response") f.update(state => { state.response_creator_id = 21; });
  if (corrupt) {
    const execute = f.transport.execute;
    f.transport.execute = async (...args) => {
      const captured = await execute(...args);
      if (captured?.successes[0]) writeFileSync(captured.successes[0].path, "{}");
      return captured;
    };
    await expect(executeAttempt({ journal, effect, objects, transport: f.transport })).rejects.toThrow();
  } else journal = await executeAttempt({ journal, effect, objects, transport: f.transport });
  const restored = readJournal(journal.directory, join(f.root, "source"));
  const ending = restored.events.at(-1);
  if (corrupt) {
    if (!ending || !("sent" in ending.payload)) throw Error("missing ended process facts");
    expect(ending.payload.sent).toBe(true);
    expect(ending.payload.reaped).toBe(true);
    expect("capture_unverified" in ending.payload && ending.payload.capture_unverified).toBe(true);
    expect(pendingAttempt(restored, effect)).toBe("success-proof-unavailable");
    return;
  }
  if (!ending || !("execution" in ending.payload) || !ending.payload.execution) throw Error("missing linked success evidence");
  expect(ending.payload.execution.successes).toHaveLength(1);
  expect(restored.header.run_id).toBe(journal.header.run_id);
  expect(pendingAttempt(restored, effect)).toBe("dispatch-outcome-unknown");
  expect(f.inspect().issues).toHaveLength(1);
});
}

for (const failure of ["request", "capture"] as const) {
test(`partial native update retains its first success (failure=${failure})`, async () => {
  const f = setup(); await f.transport.identity();
  const original = { title: "Old title", body: "Old body", labels: ["old"], draft: false };
  f.update(state => {
    state.reject_labels = failure === "request";
    state.response_labels_missing = failure === "capture";
    state.prs.push({ ...original, id: 5010, number: 501, labels: [{ id: 102, name: "old" }], state: "open",
      user: { login: "fixture-bot", id: 20 }, head: { ref: "docs-drift/one", sha: f.commit, repo: { id: 10 } },
      base: { ref: "main", repo: { id: 10 } } });
  });
  const effect: Effect = { id: "captured-update", kind: "pr-update", payload: { title: "New title", body: "New body",
    labels: ["documentation"], draft: false, number: 501, expected_head: f.commit,
    expected_payload: original, expected_payload_sha256: sha256(canonicalJSON(original)) } };
  const reviewed = fixture(f.plan.manifest.bindings, [...f.plan.manifest.effects.slice(0, 2), effect, f.plan.manifest.effects.at(-1)!]);
  const plan = sealPlan({ reviewed: validateReviewedManifest(reviewed), grants: reviewed.grants, adoption_sha256: hash("adoption"),
    publication_kind: "advisory", context: "trial", transport: "native", corrections: [], attention: [] });
  let journal = createJournal({ source_repo: join(f.root, "source"), artifact_root: join(f.root, "artifacts"), plan });
  const objects = writePublicationObjects(f.store, plan, journal.header);
  for (const metadata of plan.manifest.effects.slice(0, 2)) {
    journal = appendIntent(journal, metadata.id);
    journal = appendOutcome(journal, metadata.id, { state: "observed", observation_sha256: hash("fixture-metadata"),
      resource_id: String(metadata.payload.ref), object: objects.lease_object });
  }
  journal = appendIntent(journal, effect.id);
  const error = await executeAttempt({ journal, effect, objects, transport: f.transport }).then(() => null, (error: unknown) => error);
  expect(error).toBeInstanceOf(Error);
  if (failure === "request") {
    if (!(error instanceof PublicationExecutionError) || !error.execution) throw Error("missing native failure evidence");
    expect(error.execution.successes).toHaveLength(1);
  }
  const restored = readJournal(journal.directory, join(f.root, "source"));
  const ending = restored.events.at(-1);
  if (!ending || !("execution" in ending.payload) || !ending.payload.execution || !("sent" in ending.payload)) throw Error("missing partial execution record");
  const projection = JSON.parse(readFileSync(ending.payload.execution.successes[0].path, "utf8")) as {
    command_index: number; attempt_id: string; facts: { number: number; head_sha: string; user_id: number }; identity: { actor_id: number };
  };
  expect(projection.command_index).toBe(0);
  const proof = ending.payload.execution.successes[0];
  const originalBytes = readFileSync(proof.path);
  for (const field of ["number", "head_repository_id", "base_repository_id"]) {
    const changed = { ...projection, facts: { ...projection.facts, [field]: field === "number" ? 502 : 11 } };
    const changedBytes = canonicalJSON(changed); writeFileSync(proof.path, changedBytes);
    expect(() => readSuccess({ artifact_root: join(f.root, "artifacts"), source_repo: join(f.root, "source"), plan, effect,
      attempt_id: projection.attempt_id, evidence: { path: proof.path, sha256: sha256(changedBytes) } })).toThrow();
    writeFileSync(proof.path, originalBytes);
  }
  expect(projection.facts.head_sha).toBe(f.commit);
  expect(projection.facts.user_id).toBe(20);
  expect(projection.identity.actor_id).toBe(20);
  expect(ending.payload.sent).toBe(true);
  expect(ending.payload.reaped).toBe(true);
  expect(ending.payload.execution.successes).toHaveLength(1);
  expect(pendingAttempt(restored, effect, true)).not.toBeNull();
  if (failure === "capture") {
    expect("capture_unverified" in ending.payload && ending.payload.capture_unverified).toBe(true);
    expect(pendingAttempt(restored, effect)).toBe("success-proof-unavailable");
    return;
  }
  // Preserve the existing idempotent update path after the native target is rechecked.
  f.update(state => { state.reject_labels = false; });
  const retried = await executeAttempt({ journal: restored, effect, objects, transport: f.transport });
  const completed = retried.events.at(-1);
  if (!completed || !("execution" in completed.payload) || !completed.payload.execution) throw Error("missing completed capture");
  expect(completed.payload.execution.successes.map(reference => JSON.parse(readFileSync(reference.path, "utf8")).command_index)).toEqual([0, 1]);
  expect((await f.transport.observe(plan, effect, objects)).state).toBe("done");
  const labels = completed.payload.execution.successes[1];
  const bytes = readFileSync(labels.path), invalid = JSON.parse(bytes.toString());
  invalid.facts.labels = null; invalid.facts.id = 5010;
  const malformed = canonicalJSON(invalid); writeFileSync(labels.path, malformed);
  expect(() => readSuccess({ artifact_root: join(f.root, "artifacts"), source_repo: join(f.root, "source"), plan, effect,
    attempt_id: invalid.attempt_id, evidence: { path: labels.path, sha256: sha256(malformed) } })).toThrow();
  writeFileSync(labels.path, bytes);
});
}

test("native closure capture keeps the legacy creator distinct from the mutating actor", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.prs.push({ id: 7700, number: 77, state: "open", title: "Legacy", body: "Old proposal", draft: false,
    labels: [], user: { login: "legacy-bot", id: 90 }, head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } },
    base: { ref: "main", repo: { id: 10 } } }); });
  const effect: Effect = { id: "captured-close", kind: "pr-close", payload: { number: 77, expected_head: f.commit } };
  const reviewed = fixture(f.plan.manifest.bindings, [...f.plan.manifest.effects.slice(0, 2), effect, f.plan.manifest.effects.at(-1)!]);
  const plan = sealPlan({ reviewed: validateReviewedManifest(reviewed), grants: reviewed.grants, adoption_sha256: hash("adoption"),
    publication_kind: "advisory", context: "trial", transport: "native", corrections: [], attention: [] });
  const result = await f.transport.execute(plan, effect, writePlanObject(f.store, plan), "close-attempt");
  if (!result?.successes[0]) throw Error("missing closure capture");
  const projection = JSON.parse(readFileSync(result.successes[0].path, "utf8"));
  expect(projection.facts.user_id).toBe(90);
  expect(projection.identity.actor_id).toBe(20);
  expect(projection.facts.head_sha).toBe(f.commit);
  expect(projection.facts.state).toBe("closed");
});

test("a same-name replacement repository is refused before native mutation dispatch", async () => {
  const f = setup(); await f.transport.identity();
  const effect: Effect = { id: "scoped-issue", kind: "issue-create", payload: {
    title: "Scoped", body: "Scope proof\nhttps://github.com/fixture/docs/blob/" + f.commit + "/README.md", labels: [], prior_ids: [],
    evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.commit, evidence_sha256: sha256(f.readme),
  } };
  const reviewed = fixture(f.plan.manifest.bindings, [...f.plan.manifest.effects.slice(0, 2), effect, f.plan.manifest.effects.at(-1)!]);
  const plan = sealPlan({ reviewed: validateReviewedManifest(reviewed), grants: reviewed.grants, adoption_sha256: hash("adoption"),
    publication_kind: "advisory", context: "trial", transport: "native", corrections: [], attention: [] });
  f.update(state => { state.repository_id = 11; });
  const error = await f.transport.execute(plan, effect, writePlanObject(f.store, plan), "scoped-attempt").then(() => null, (error: unknown) => error);
  if (!(error instanceof PublicationExecutionError)) throw Error("missing scoped execution refusal");
  expect(error.sent).toBe(false);
  expect(error.reaped).toBe(true);
  expect(f.inspect().issues).toHaveLength(0);
});

for (const stage of ["retain", "read"] as const) {
  test(`foreign base repository is refused during success ${stage}`, async () => {
    const f = setup(); await f.transport.identity();
    f.update(state => { state.prs.push({ id: 7700, number: 77, state: "open", body: "Legacy", labels: [],
      user: { login: "legacy-bot", id: 90 }, head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } },
      base: { ref: "main", repo: { id: 10 } } }); });
    const effect: Effect = { id: "scoped-close", kind: "pr-close", payload: { number: 77, expected_head: f.commit } };
    const reviewed = fixture(f.plan.manifest.bindings, [...f.plan.manifest.effects.slice(0, 2), effect, f.plan.manifest.effects.at(-1)!]);
    const plan = sealPlan({ reviewed: validateReviewedManifest(reviewed), grants: reviewed.grants, adoption_sha256: hash("adoption"),
      publication_kind: "advisory", context: "trial", transport: "native", corrections: [], attention: [] });
    const result = await f.transport.execute(plan, effect, writePlanObject(f.store, plan), "scope-attempt");
    if (!result?.successes[0]) throw Error("missing scoped closure capture");
    const proof = result.successes[0], projection = JSON.parse(readFileSync(proof.path, "utf8"));
    const scope = { artifact_root: join(f.root, "artifacts"), source_repo: join(f.root, "source"), plan, effect, attempt_id: "scope-attempt" };
    if (stage === "read") {
      projection.facts.base_repository_id = 11;
      const bytes = canonicalJSON(projection); writeFileSync(proof.path, bytes);
      expect(() => readSuccess({ ...scope, evidence: { path: proof.path, sha256: sha256(bytes) } })).toThrow();
    } else {
      const response = { ...f.inspect().prs[0], base: { ref: "main", repo: { id: 11 } } };
      const identity = await f.transport.identity();
      expect(() => retainSuccess({ ...scope, command_directory: projection.command_directory, command_index: 0,
        hostname: f.settings.hostname, method: "PATCH", endpoint: "repos/fixture/docs/pulls/77", identity,
        response: Buffer.from("HTTP/2.0 200 OK\r\n\r\n" + JSON.stringify(response)) })).toThrow();
    }
  });
}

test("native comment capture binds its complete parent destination", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.prs.push({ id: 7700, number: 77, state: "open", body: "Legacy", labels: [],
    user: { login: "legacy-bot", id: 90 }, head: { ref: "docs-audit/old", sha: f.commit, repo: { id: 10 } },
    base: { ref: "main", repo: { id: 10 } } }); });
  const effect: Effect = { id: "scoped-comment", kind: "comment-create", payload: { number: 77, body: "Bound comment", prior_ids: [] } };
  const reviewed = fixture(f.plan.manifest.bindings, [...f.plan.manifest.effects.slice(0, 2), effect, f.plan.manifest.effects.at(-1)!]);
  const plan = sealPlan({ reviewed: validateReviewedManifest(reviewed), grants: reviewed.grants, adoption_sha256: hash("adoption"),
    publication_kind: "advisory", context: "trial", transport: "native", corrections: [], attention: [] });
  const result = await f.transport.execute(plan, effect, writePlanObject(f.store, plan), "comment-attempt");
  if (!result?.successes[0]) throw Error("missing comment capture");
  const evidence = result.successes[0], original = readFileSync(evidence.path);
  const scope = { artifact_root: join(f.root, "artifacts"), source_repo: join(f.root, "source"), plan, effect, attempt_id: "comment-attempt" };
  expect(readSuccess({ ...scope, evidence })).toEqual(evidence);
  for (const mode of ["host", "partial-parent", "target", "status", "resource-shape"]) {
    const value = JSON.parse(original.toString());
    if (mode === "host") value.facts.parent_host = "foreign.example";
    if (mode === "partial-parent") {
      value.facts.parent_url_sha256 = null; value.facts.parent_host = null; value.facts.parent_path = null;
    }
    if (mode === "target") value.facts.parent_number = 78;
    if (mode === "status") value.status = 200;
    if (mode === "resource-shape") { value.facts.id = null; value.facts.labels = []; }
    const bytes = canonicalJSON(value); writeFileSync(evidence.path, bytes);
    expect(() => readSuccess({ ...scope, evidence: { path: evidence.path, sha256: sha256(bytes) } })).toThrow();
  }
});

test("native PR creation links application evidence for the resource and its labels", async () => {
  const f = setup(); await f.transport.identity();
  f.update(state => { state.refs["refs/heads/docs-drift/one"] = f.commit; });
  const effect = f.plan.manifest.effects.find(item => item.kind === "pr-create")!;
  const selected = await startCleanupJournal(f, [effect]);
  const journal = await executeAttempt({ journal: appendIntent(selected.journal, effect.id), effect,
    objects: selected.objects, transport: f.transport });
  const ending = journal.events.at(-1);
  if (!ending || !("execution" in ending.payload) || !ending.payload.execution || !("attempt_id" in ending.payload)) throw Error("missing complete creation captures");
  const attemptId = ending.payload.attempt_id;
  expect(ending.payload.execution.successes).toHaveLength(2);
  expect(ending.payload.execution).toHaveProperty("before");
  expect(ending.payload.execution).toHaveProperty("commands", 2);
  const captures = ending.payload.execution.successes.map(evidence => {
    readSuccess({ artifact_root: f.transport.artifact_root, source_repo: selected.repo,
      plan: selected.plan, effect, attempt_id: attemptId, evidence });
    return JSON.parse(readFileSync(evidence.path, "utf8"));
  });
  expect(captures.map(value => value.command_index)).toEqual([0, 1]);
  expect(captures[0].facts).toMatchObject({ number: 501, state: "open", draft: true,
    head_sha: f.commit, head_ref: "docs-drift/one", base_ref: "main", user_id: 20 });
  expect(captures[1].facts.labels).toEqual([101]);
  expect(captures[1].endpoint).toBe("repos/fixture/docs/issues/501/labels");
  const { readAppliedDelivery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/delivery-proof");
  const applied = readAppliedDelivery({ source_repo: selected.repo, journal_directory: journal.directory,
    effect_id: effect.id, settings: f.settings });
  expect(applied).toMatchObject({ resource_id: 901, number: 501, head_sha: f.commit });
  expect((await f.transport.observe(selected.plan, effect, selected.objects)).state).toBe("done");
  f.update(state => { state.prs[0].title = "Later owner edit"; });
  expect((await f.transport.observe(selected.plan, effect, selected.objects)).state).toBe("conflict");
  expect(readAppliedDelivery({ source_repo: selected.repo, journal_directory: journal.directory,
    effect_id: effect.id, settings: f.settings }).proof_sha256).toBe(applied.proof_sha256);
});

for (const kind of ["issue-create", "comment-create", "pr-update", "pr-close"] as const) {
test(`captured ${kind} proof survives a later edit without inferring application from that edit`, async () => {
  const { readAppliedDelivery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/delivery-proof");
  const f = setup(); await f.transport.identity();
  const original = { title: "Original title", body: "Original body", labels: ["old"], draft: true };
  if (kind !== "issue-create") f.update(state => { state.prs.push({ ...original, id: 901, number: 77, state: "open", merged_at: null,
    labels: [{ id: 102, name: "old" }], user: { login: kind === "pr-close" ? "legacy-bot" : "fixture-bot", id: kind === "pr-close" ? 90 : 20 },
    head: { ref: "docs-drift/one", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", sha: f.commit, repo: { id: 10 } } }); });
  const body = publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("delivered");
  const effect: Effect = kind === "issue-create" ? { id: "delivered", kind, payload: { title: "Reviewed issue", body: body + "\nhttps://github.com/fixture/docs/blob/" + f.commit + "/README.md",
    labels: ["documentation"], prior_ids: [], evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.commit, evidence_sha256: sha256(f.readme) } }
    : kind === "comment-create" ? { id: "delivered", kind, payload: { number: 77, body, prior_ids: [] } }
      : kind === "pr-close" ? { id: "delivered", kind, payload: { number: 77, expected_head: f.commit } }
        : { id: "delivered", kind, payload: { number: 77, expected_head: f.commit, expected_payload: original,
          expected_payload_sha256: sha256(canonicalJSON(original)), title: "Reviewed title", body, labels: ["documentation"], draft: true } };
  const explanation: Effect = { id: "explain", kind: "comment-create", payload: { number: 77, prior_ids: [],
    body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("explain") } };
  const selected = await startCleanupJournal(f, kind === "pr-close" ? [explanation, effect] : [effect]);
  let journal = selected.journal;
  if (kind === "pr-close") {
    journal = await executeAttempt({ journal: appendIntent(journal, explanation.id), effect: explanation, objects: selected.objects, transport: f.transport });
    const observed = await f.transport.observe(selected.plan, explanation, selected.objects);
    if (observed.state !== "done") throw Error("missing proven current explanation");
    journal = appendOutcome(journal, explanation.id, observed.outcome);
  }
  journal = await executeAttempt({ journal: appendIntent(journal, effect.id), effect, objects: selected.objects, transport: f.transport });
  const scope = { source_repo: selected.repo, journal_directory: journal.directory, effect_id: effect.id, settings: f.settings };
  const applied = readAppliedDelivery(scope);
  expect(applied).toMatchObject({ context: "trial", transport: "native", effect_id: effect.id,
    resource_id: kind === "issue-create" ? 801 : kind === "comment-create" ? 701 : 901 });
  if (kind === "pr-close") expect(applied.explanation_effect_id).toBe(explanation.id);
  f.update(state => {
    if (kind === "issue-create") state.issues[0].title = "Later owner edit";
    else if (kind === "comment-create") state.comments["77"][0].body += "\nLater owner edit";
    else if (kind === "pr-close") state.prs[0].state = "open";
    else state.prs[0].title = "Later owner edit";
  });
  expect((await f.transport.observe(selected.plan, effect, selected.objects)).state).toBe(kind === "pr-close" ? "absent" : "conflict");
  expect(readAppliedDelivery(scope).proof_sha256).toBe(applied.proof_sha256);
});
}

for (const kind of ["pr-create", "issue-create", "pr-update"] as const) {
test(`settled ${kind} responses with missing approved labels cannot prove full application`, async () => {
  const { readAppliedDelivery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/delivery-proof");
  const f = setup(); await f.transport.identity();
  const original = { title: "Original title", body: "Original body", labels: ["old"], draft: true };
  f.update(state => {
    state.refs["refs/heads/docs-drift/one"] = f.commit;
    if (kind === "pr-update") state.prs.push({ ...original, id: 901, number: 77, state: "open", merged_at: null,
      labels: [{ id: 102, name: "old" }], user: { login: "fixture-bot", id: 20 },
      head: { ref: "docs-drift/one", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", sha: f.commit, repo: { id: 10 } } });
  });
  const common = { title: "Reviewed title", body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("partial"), labels: ["documentation"], draft: true };
  const effect: Effect = kind === "pr-create" ? { id: "partial", kind, payload: { ...common, base: "main", branch: "docs-drift/one" } }
    : kind === "pr-update" ? { id: "partial", kind, payload: { ...common, number: 77, expected_head: f.commit,
      expected_payload: original, expected_payload_sha256: sha256(canonicalJSON(original)) } }
      : { id: "partial", kind, payload: { title: common.title, body: common.body + "\nhttps://github.com/fixture/docs/blob/" + f.commit + "/README.md",
        labels: common.labels, prior_ids: [], evidence_repository: "fixture/docs", evidence_path: "README.md", evidence_commit: f.commit, evidence_sha256: sha256(f.readme) } };
  const selected = await startCleanupJournal(f, [effect]);
  f.update(state => { state.drop_labels = true; });
  await executeAttempt({ journal: appendIntent(selected.journal, effect.id), effect, objects: selected.objects, transport: f.transport })
    .catch(error => { expect(error).toBeInstanceOf(PublicationExecutionError); });
  const journal = readJournal(selected.journal.directory, selected.repo);
  const ending = journal.events.at(-1);
  if (!ending || !("sent" in ending.payload) || !ending.payload.execution) throw Error("missing settled native captures");
  expect(ending.payload.reaped).toBe(true);
  expect(ending.payload.capture_unverified).toBeUndefined();
  expect(ending.payload.execution.commands).toBe(ending.payload.execution.successes.length);
  f.update(state => { (kind === "issue-create" ? state.issues[0] : state.prs[0]).title = "Later owner edit"; });
  expect(() => readAppliedDelivery({ source_repo: selected.repo, journal_directory: journal.directory,
    effect_id: effect.id, settings: f.settings })).toThrow("delivery-payload-incomplete");
  expect(f.inspect().refs[f.settings.publication.lease_ref]).toBe(selected.objects.lease_object);
});
}

test("an unapplied draft component cannot be hidden by successful text and label captures", async () => {
  const { readAppliedDelivery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/delivery-proof");
  const f = setup(); await f.transport.identity();
  const original = { title: "Original title", body: "Original body", labels: ["old"], draft: false };
  f.update(state => { state.prs.push({ ...original, id: 901, number: 77, state: "open", merged_at: null,
    labels: [{ id: 102, name: "old" }], user: { login: "fixture-bot", id: 20 },
    head: { ref: "docs-drift/one", sha: f.commit, repo: { id: 10 } }, base: { ref: "main", sha: f.commit, repo: { id: 10 } } }); state.reject_ready = true; });
  const effect: Effect = { id: "update", kind: "pr-update", payload: { number: 77, expected_head: f.commit,
    expected_payload: original, expected_payload_sha256: sha256(canonicalJSON(original)), title: "Reviewed title",
    body: publicationMarker(f.settings, "operation-1") + "\n" + effectMarker("update"), labels: ["documentation"], draft: true } };
  const selected = await startCleanupJournal(f, [effect]);
  await expect(executeAttempt({ journal: appendIntent(selected.journal, effect.id), effect, objects: selected.objects, transport: f.transport })).rejects.toThrow();
  const journal = readJournal(selected.journal.directory, selected.repo), ending = journal.events.at(-1);
  if (!ending || !("sent" in ending.payload) || !ending.payload.execution) throw Error("missing partial update captures");
  expect(ending.payload.reaped).toBe(true);
  expect(ending.payload.execution.commands).toBe(3);
  expect(ending.payload.execution.successes).toHaveLength(2);
  expect(f.inspect().prs[0].draft).toBe(false);
  expect(() => readAppliedDelivery({ source_repo: selected.repo, journal_directory: journal.directory,
    effect_id: effect.id, settings: f.settings })).toThrow("delivery-command-settlement-unproved");
});

test("capture persistence failure retains no raw response canaries and supplies no application proof", async () => {
  const { readAppliedDelivery } = await import("../../../plugins/vh-adlc/scripts/docs-drift/delivery-proof");
  const f = setup(); await f.transport.identity();
  f.update(state => { state.refs["refs/heads/docs-drift/one"] = f.commit; state.response_canary = true; });
  const effect = f.plan.manifest.effects.find(item => item.kind === "pr-create")!;
  const selected = await startCleanupJournal(f, [effect]);
  const publish = journalArtifacts.publishArtifact;
  const capture = spyOn(journalArtifacts, "publishArtifact").mockImplementation((path, bytes) => {
    if (/\/success-[a-f0-9-]+\.json$/u.test(path)) throw Error("simulated projection persistence failure");
    publish(path, bytes);
  });
  try {
    await expect(executeAttempt({ journal: appendIntent(selected.journal, effect.id), effect,
      objects: selected.objects, transport: f.transport })).rejects.toThrow();
  } finally { capture.mockRestore(); }
  expect(f.inspect().prs).toHaveLength(1);
  expect(() => readAppliedDelivery({ source_repo: selected.repo, journal_directory: selected.journal.directory,
    effect_id: effect.id, settings: f.settings })).toThrow("delivery-command-settlement-unproved");
  const artifactRoot = f.transport.artifact_root;
  for (const entry of readdirSync(artifactRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name), bytes = readFileSync(path, "utf8");
    expect(bytes).not.toContain("response-header-canary");
    expect(bytes).not.toContain("response-body-canary");
    expect(entry.name).not.toBe("stdout");
    expect(entry.name).not.toBe("stderr");
  }
});

for (const mode of ["missing-before", "missing-success", "foreign-before", "missing-file", "oversized", "tampered", "extra-command", "unreaped", "pre-capture", "changed-host"] as const) {
test(`original captured delivery refuses ${mode} proof`, async () => {
  const { readAppliedDelivery, readBefore, retainBefore } = await import("../../../plugins/vh-adlc/scripts/docs-drift/delivery-proof");
  const f = setup(); await f.transport.identity();
  f.update(state => { state.refs["refs/heads/docs-drift/one"] = f.commit; });
  const effect = f.plan.manifest.effects.find(item => item.kind === "pr-create")!;
  const selected = await startCleanupJournal(f, [effect]), execute = f.transport.execute;
  f.transport.execute = async (...args) => {
    const captured = await execute(...args);
    if (!captured?.before || captured.commands !== 2 || captured.successes.length !== 2 || !args[3]) throw Error("incomplete native test fixture capture");
    if (mode === "missing-before") { delete captured.before; }
    if (mode === "missing-success") captured.successes = captured.successes.slice(0, 1);
    if (mode === "foreign-before") {
      const scope = { artifact_root: f.transport.artifact_root, source_repo: selected.repo, plan: selected.plan, effect, attempt_id: args[3] };
      const data = readBefore({ ...scope, evidence: captured.before! });
      captured.before = retainBefore({ ...scope, attempt_id: "foreign-attempt", data });
    }
    if (mode === "missing-file") rmSync(captured.successes[0].path);
    if (mode === "oversized") {
      const bytes = Buffer.alloc(65537, " "); writeFileSync(captured.successes[0].path, bytes);
      captured.successes[0].sha256 = sha256(bytes);
    }
    if (mode === "tampered") {
      const value = JSON.parse(readFileSync(captured.before!.path, "utf8")); value.data.identity.actor_id = 21;
      const bytes = canonicalJSON(value); writeFileSync(captured.before!.path, bytes);
      captured.before!.sha256 = sha256(bytes);
    }
    if (mode === "extra-command") captured.commands++;
    if (mode === "unreaped") throw new PublicationExecutionError(true, false, undefined, captured);
    if (mode === "pre-capture") return;
    return captured;
  };
  await executeAttempt({ journal: appendIntent(selected.journal, effect.id), effect, objects: selected.objects, transport: f.transport })
    .catch(error => { expect(error).toBeInstanceOf(Error); });
  expect(f.inspect().prs).toHaveLength(1);
  f.update(state => { state.prs[0].title = "Later owner edit"; });
  const settings = mode === "changed-host" ? { ...f.settings, hostname: "other.example" } : f.settings;
  expect(() => readAppliedDelivery({ source_repo: selected.repo, journal_directory: selected.journal.directory,
    effect_id: effect.id, settings })).toThrow();
  expect(f.inspect().refs[f.settings.publication.lease_ref]).toBe(selected.objects.lease_object);
});
}
