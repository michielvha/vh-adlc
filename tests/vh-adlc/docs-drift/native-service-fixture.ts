/** Synthetic native CLI service used by transport and normal-controller tests. */
export function nativeServiceProgram(statePath: string, calls: string): string {
  return `#!${process.execPath}
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const statePath = ${JSON.stringify(statePath)}, log = ${JSON.stringify(calls)};
const state = JSON.parse(readFileSync(statePath, 'utf8')), args = process.argv.slice(2);
appendFileSync(log, JSON.stringify({ program: process.argv[1].split('/').at(-1), args }) + '\\n');
const nativeEnvironment = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_COUNT: '0' };
function realGit(argv) {
    const result = Bun.spawnSync([state.git_executable, ...argv], { env: nativeEnvironment, stdout: 'pipe', stderr: 'pipe' });
    if (result.exitCode !== 0) throw Error('Synthetic owned Git request failed ' + argv[0]);
    return Buffer.from(result.stdout);
}
if (state.git_source) {
    state.refs = Object.fromEntries(realGit(['-C', state.git_source, 'for-each-ref', '--format=%(refname) %(objectname)']).toString().trim().split('\\n').filter(Boolean).map(line => line.split(' ')));
    for (const pr of state.prs) if (state.refs['refs/heads/' + pr.head.ref]) pr.head.sha = state.refs['refs/heads/' + pr.head.ref];
}
const save = () => writeFileSync(statePath, JSON.stringify(state));
if (process.argv[1].endsWith('/gh') && args[0] === 'api' && !args.includes('graphql') && Number.isSafeInteger(state.rest_request_limit)) {
    state.rest_requests = (state.rest_requests ?? 0) + 1;
    save();
    if (state.rest_requests > state.rest_request_limit) {
        process.stdout.write('HTTP/2.0 403 Forbidden\\r\\nx-ratelimit-limit: 1000\\r\\nx-ratelimit-remaining: 0\\r\\nx-ratelimit-reset: ' + Math.ceil(Date.now() / 1000 + 3600) + '\\r\\n\\r\\n' + JSON.stringify({ message: 'Synthetic API rate limit exceeded' }));
        process.exit(1);
    }
}
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
    if (state.git_source && !args.includes('push')) {
        if (args.some(arg => arg.startsWith('https://') && arg !== 'https://github.com/fixture/docs.git')) process.exit(91);
        const selected = args.map(arg => arg === 'https://github.com/fixture/docs.git' ? state.git_source : arg);
        if (selected.includes('fetch')) selected.splice(selected.indexOf('fetch'), 0, '-c', 'protocol.file.allow=always');
        const result = Bun.spawnSync([state.git_executable, ...selected], { env: nativeEnvironment, stdout: 'inherit', stderr: 'inherit' });
        process.exit(result.exitCode);
    }

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
    const previous = updates.map(update => state.refs[update.ref] ?? '');
    for (const update of updates) {
        const current = state.refs[update.ref] ?? '';
        if (!update.head ? current !== update.expected : current !== update.head && current !== update.expected) process.exit(1);
    }
    if (state.git_source) {
        if (args.filter(arg => arg === 'https://github.com/fixture/docs.git').length !== 1
          || args.some(arg => arg.startsWith('https://') && arg !== 'https://github.com/fixture/docs.git')) process.exit(91);
        const selected = args.map(arg => arg === 'https://github.com/fixture/docs.git' ? state.git_source : arg);
        selected.splice(selected.indexOf('push'), 0, '-c', 'protocol.file.allow=always');
        const result = Bun.spawnSync([state.git_executable, ...selected], { env: nativeEnvironment, stdout: 'pipe', stderr: 'pipe' });
        if (result.exitCode !== 0) { process.stdout.write(Buffer.from(result.stdout)); process.stderr.write(Buffer.from(result.stderr)); process.exit(result.exitCode); }
    }
    for (const { ref, head } of updates) {
        if (head) {
            state.refs[ref] = head;
            for (const pr of state.prs) if ('refs/heads/' + pr.head.ref === ref) pr.head.sha = head;
        } else delete state.refs[ref];
    }
    save();
    const statusFor = (item, index) => {
        if (!item.head) return '-';
        if (previous[index] === item.head) return '=';
        return previous[index] ? '+' : '*';
    };
    process.stdout.write('To https://github.com/fixture/docs.git\\n' + updates.map((item, index) => statusFor(item, index) + '\\t' + item.head + ':' + item.ref + '\\t[fixture applied]\\n').join('') + 'Done\\n');
    process.exit(0);
}
if (args.includes('graphql')) {
    const response = { data: { viewer: { login: state.viewer_login ?? 'fixture-bot', databaseId: state.viewer_id ?? 20 } } };
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
const endpoint = args.find(a => a === 'user' || a.startsWith('user/') || a.startsWith('repos/'));
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
            labels: [], user: { login: state.viewer_login ?? 'fixture-bot', id: state.response_creator_id ?? state.viewer_id ?? 20 },
            base: { ref: payload.base, sha: state.commit, repo: { id: 10 } },
            head: { ref: payload.head, sha: state.refs['refs/heads/' + payload.head], repo: { id: 10 } } };
        if (state.repository_identity) { returned.base.repo = state.repository_identity; returned.head.repo = state.repository_identity; returned.user.type = state.viewer_type ?? 'Bot'; }
        state.prs.push(returned);
    } else if (method === 'POST' && endpoint === 'repos/fixture/docs/issues') {
        returned = { ...payload, id: 801, number: 601, state: 'open', user: { login: state.viewer_login ?? 'fixture-bot', id: state.response_creator_id ?? state.viewer_id ?? 20 }, labels: applyLabels(payload.labels) };
        state.issues.push(returned);
    } else if (method === 'POST' && endpoint.endsWith('/comments')) {
        const number = endpoint.split('/').at(-2);
        returned = { id: 701, body: payload.body, issue_url: 'https://api.github.com/repos/fixture/docs/issues/' + number, user: { login: state.viewer_login ?? 'fixture-bot', id: state.viewer_id ?? 20 } };
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
if (endpoint?.startsWith('user/')) {
    if (state.account_status) { status = state.account_status; value = { message: 'Synthetic native account unavailable' }; }
    else value = state.account_response ?? { login: state.viewer_login ?? 'fixture-bot', id: state.viewer_id ?? 20 };
}
else if (endpoint === 'user') {
    if (state.app_token) {
        status = 403;
        value = { message: 'Resource not accessible by integration' };
    }
    else
        value = { login: state.viewer_login ?? 'fixture-bot', id: state.viewer_id ?? 20 };
}
else if (endpoint === 'repos/fixture/docs')
    value = { id: state.repository_id, full_name: 'fixture/docs', default_branch: 'main' };
else if (endpoint?.startsWith('repos/fixture/docs/actions/runs/')) {
    const parts = endpoint.split('/');
    value = (state.workflow_runs ?? []).find(run => run.id === Number(parts[5]) && (!parts[7] || run.run_attempt === Number(parts[7])));
    if (!value) { status = 404; value = { message: 'Synthetic workflow run unavailable' }; }
}
else if (state.git_source && endpoint?.startsWith('repos/fixture/docs/git/commits/')) {
    const object = endpoint.split('/').at(-1);
    if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(object)) process.exit(91);
    try {
        const lines = realGit(['-C', state.git_source, 'show', '--no-patch', '--format=%T%n%P%n%B', object]).toString().split('\\n');
        value = { sha: object, tree: { sha: lines[0] }, parents: lines[1].split(' ').filter(Boolean).map(sha => ({ sha })), message: lines.slice(2).join('\\n') };
    } catch { status = 404; value = { message: 'Synthetic owned commit unavailable' }; }
}
else if (state.git_source && endpoint?.startsWith('repos/fixture/docs/git/trees/')) {
    const object = endpoint.split('/').at(-1).split('?')[0];
    if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(object)) process.exit(91);
    try {
        const fields = realGit(['-C', state.git_source, 'ls-tree', '-z', object]).toString().split('\\0').filter(Boolean);
        value = { sha: object, truncated: false, tree: fields.map(row => { const tab = row.indexOf('\\t'), [mode, type, sha] = row.slice(0, tab).split(' '); return { mode: mode === '040000' ? mode : mode.padStart(6, '0'), type, sha, path: row.slice(tab + 1) }; }) };
    } catch { status = 404; value = { message: 'Synthetic owned tree unavailable' }; }
}
else if (state.git_source && endpoint?.startsWith('repos/fixture/docs/git/blobs/')) {
    const object = endpoint.split('/').at(-1);
    if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(object)) process.exit(91);
    try { const bytes = realGit(['-C', state.git_source, 'cat-file', 'blob', object]); value = { sha: object, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') }; }
    catch { status = 404; value = { message: 'Synthetic owned blob unavailable' }; }
}
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
}
