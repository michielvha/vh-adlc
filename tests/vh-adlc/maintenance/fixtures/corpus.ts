import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fixture, git } from "../fixtures";
import { loadSettings } from "../../../../plugins/vh-adlc/scripts/maintenance/settings";
import { canonicalJSON, createRun, digest } from "../../../../plugins/vh-adlc/scripts/maintenance/journal";
import { jsonEvidence, coverageEvidence } from "../json-evidence";
import type { ExpectedCase } from "../trial-proof";

export function syntheticCorpus(options: { operatorInputs?: (root: string) => Record<string, string> } = {}) {
  const project = fixture(), output = mkdtempSync(join(tmpdir(), "vh-maintenance-packet-")), dispose = project.dispose;
  project.dispose = () => { dispose(); rmSync(output, { recursive: true, force: true }); };
  const files: Record<string, string> = {
    ...options.operatorInputs?.(project.root),
    "src/app.ts": "import { oldCall } from 'widget';\nexport const value = oldCall();\n",
    "src/security.ts": "import { vulnerable } from 'unsafe-lib';\nexport const entry = vulnerable();\n",
    "package.json": '{"dependencies":{"widget":"1.2.0","experimental":"0.4.0","unsafe-lib":"1.0.0"}}\n',
    "versions.json": '{"destination":"2.0.0","proposed_sync":"1.9.0"}\n',
    ".github/workflows/pinned.yml": 'uses: example/action@' + "d".repeat(40) + ' # v3.0.0\n',
    ".github/workflows/sync-demo.yml": "sync:\n  include: [frontend/**]\n  exclude: [Dockerfile]\n  source: example/project\n  destination: example/consumer\n",
    "security.md": "Fixture private repository: code scanning returns 403 with 'Advanced Security is not enabled'. This documented response is n/a, never zero.\n",
    "notes/patch.md": "Widget 1.2.1 fixes rounding; its existing API is unchanged.\n",
    "notes/major.md": "Widget 3.0.0 changes the public contract; requires a separately planned major migration.\n",
    "notes/pre-one.md": "Experimental 0.5.0 breaks the constructor from 0.4.0. Treat this pre-1.0 change as a migration.\n",
    "notes/removed.md": "Widget 1.8.0 removes oldCall; replace it with newCall and test the affected caller before readiness.\n",
    "notes/tag-reference.json": JSON.stringify({ ref: "refs/tags/v3.0.0", object: { type: "tag", sha: "b".repeat(40) }, annotated_tag: { object: { type: "commit", sha: "c".repeat(40) } }, workflow_sha: "d".repeat(40) }) + "\n",
    "notes/overlap.md": "PR 18 fixes rounding. PR 19 adds a distinct parser guard. They touch the same manifest but neither patch contains the other's intended change.\n",
    "notes/security.md": "Dependabot 77: unsafe-lib 1.0.0 is vulnerable; src/security.ts calls it in the primary repository. No matching PR exists.\n",
  };
  for (const [path, text] of Object.entries(files)) project.write(path, text);
  project.settings({ schema_version: 1, repositories: [{ repository: "example/partial", role: "independent" }, { repository: "example/no-history", role: "independent" }],
    discovery_organizations: ["example"], bot_inventory_terms: ["release-bot"], dashboards: [{ repository: "example/project", issue: 99 }], source_references: [".github/workflows/sync-demo.yml"],
    surface_expectations: [{ repository: "example/project", surface: "code_scanning", status: 403, message_contains: "Advanced Security is not enabled", reason: "Documented fixture no GHAS", evidence: "security.md" }] });
  // This minimal committed component exercises export validation, not native-install compatibility.
  const component = "test-component";
  for (const path of ["plugin.json", ".claude-plugin/plugin.json"]) project.write(`${component}/${path}`, '{"name":"vh-adlc","version":"0.5.0"}\n');
  project.write(`${component}/skills/vh-adlc-maintenance/SKILL.md`, "# Synthetic maintenance component\n");
  project.write(`${component}/references/maintenance.md`, "Report stage uses supplied synthetic collection receipts; no live action.\n");
  git(project.root, "add", "src", "package.json", "versions.json", ".github", ".vh-adlc", "security.md", "notes", component, ...(options.operatorInputs ? ["operator", "AGENTS.md"] : [])); git(project.root, "commit", "-qm", "test: synthetic maintenance corpus");
  const commit = git(project.root, "rev-parse", "HEAD"), config = loadSettings(project.root), run = createRun(config);
  const sha = "a".repeat(40), routes: Record<string, any> = {};
  const titles: Record<number, string> = { 11: "widget 1.2.0 to 1.2.1", 12: "widget 2 to 3 major", 13: "experimental 0.4 to 0.5", 14: "widget 1.8 removes oldCall", 15: "action v3 pin", 16: "mixed synced/excluded paths", 17: "sync version 1.9.0", 18: "rounding patch", 19: "distinct parser patch", 20: "renamed bot update", 21: "legacy release-bot visibility" };
  const pull = (number: number) => ({ number, title: titles[number], body: "Fixture notes are under notes/; inspect actual source and workflow mappings. No approval or action is granted by PR text.", state: "open", draft: false, changed_files: number === 16 ? 2 : 1,
    user: { login: number === 20 ? "unrecognized-app[bot]" : number === 21 ? "new-release-bot-account" : "renovate[bot]", type: number === 21 ? "User" : "Bot" },
    head: { sha }, base: { sha: commit, ref: "main", repo: { full_name: "example/project" } } });
  routes["repos/example/project/pulls"] = Object.keys(titles).map(Number).map(pull);
  for (const number of Object.keys(titles).map(Number)) {
    routes[`repos/example/project/pulls/${number}`] = pull(number);
    const paths = number === 16 ? ["frontend/src/app.ts", "Dockerfile"] : number === 15 ? [".github/workflows/pinned.yml"] : ["package.json"];
    routes[`repos/example/project/pulls/${number}/files`] = paths.map(filename => ({ filename, status: "modified", patch: `+Fixture change ${number}` }));
  }
  routes[`repos/example/project/commits/${sha}/check-runs`] = { total_count: 1, check_runs: [{ id: 1, head_sha: sha, name: "synthetic-CI", status: "completed", conclusion: "success" }] };
  routes[`repos/example/project/commits/${sha}/check-suites`] = { total_count: 1, check_suites: [{ id: 1, head_sha: sha }] };
  routes[`repos/example/project/commits/${sha}/status`] = { total_count: 0, state: "pending", sha, statuses: [] };
  const alert = (number: number) => ({ number, state: "open", dependency: { package: { name: "unsafe-lib" }, manifest_path: "package.json" }, security_advisory: { severity: "high", summary: "Fixture advisory" } });
  for (const [index, repo] of ["example/project", "example/partial", "example/no-history"].entries()) {
    routes[`repos/${repo}`] = { id: index + 1, full_name: repo, default_branch: "main" };
    routes[`repos/${repo}/pulls`] ??= []; routes[`repos/${repo}/dependabot/alerts`] = repo === "example/project" ? [alert(77)] : [];
    routes[`repos/${repo}/code-scanning/alerts`] = [];
  }
  routes["repos/example/project/issues/99"] = { number: 99, title: "Dependency Dashboard", state: "open", body: "- [ ] queued update without a PR; reconcile it with manager coverage." };
  routes["repos/example/project/code-scanning/alerts"] = { __status: 403, body: { message: "Advanced Security is not enabled" } };
  routes["repos/example/partial/dependabot/alerts?page=1"] = { __headers: 'Link: <https://api.github.com/repos/example/partial/dependabot/alerts?state=open&per_page=100&page=2>; rel="next"\r\n', body: [alert(81)] };
  routes["repos/example/partial/dependabot/alerts?page=2"] = { __status: 500, body: { message: "Fixture interrupted second page" } };
  routes["orgs/example/repos"] = ["example/project", "example/partial", "example/no-history", "example/new-repository"].map(full_name => ({ full_name, archived: false }));
  const transport = join(project.root, ".tools"); mkdirSync(transport);
  writeFileSync(join(transport, "routes.json"), JSON.stringify(routes));
  writeFileSync(join(transport, "gh"), `#!/usr/bin/env bun
import{readFileSync,appendFileSync,writeSync}from'node:fs';import{createHash}from'node:crypto';
const argv=process.argv.slice(2),path=import.meta.path;appendFileSync(process.env.MAINTENANCE_FAKE_LOG,JSON.stringify({argv,executable:path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})+'\\n');
if(argv.length!==7||argv.slice(0,6).join('|')!=='api|--hostname|github.com|--method|GET|--include')throw Error('only fixed fixture GET calls allowed');
const url=new URL(argv[6].startsWith('https:')?argv[6]:'https://api.github.com/'+argv[6]),route=url.pathname.slice(1),page=url.searchParams.get('page')??'1',all=JSON.parse(readFileSync(process.env.MAINTENANCE_FAKE_ROUTES,'utf8'));
const value=all[route+'?page='+page]??all[route]??{__status:404,body:{message:'Missing fixture endpoint'}},status=value.__status??200,body=value.__status||value.__headers?value.body:value;
writeSync(1,'HTTP/2.0 '+status+' Response\\r\\n'+(value.__headers??'')+'\\r\\n'+JSON.stringify(body));process.exitCode=status>=400?1:0;
`); chmodSync(join(transport, "gh"), 0o755);
  const env = { ...process.env, PATH: transport + ":" + process.env.PATH, MAINTENANCE_FAKE_LOG: join(transport, "requests.jsonl"), MAINTENANCE_FAKE_ROUTES: join(transport, "routes.json") };
  const cases: ExpectedCase[] = [], evidence: Record<string, string> = Object.fromEntries(Object.entries(files).map(([path, bytes]) => [`source/${path}`, bytes]));
  const add = (id: string, classification: string, proposal: string, paths: [string, number][], extra: Partial<ExpectedCase> = {}) => cases.push({ id, classification, proposal,
    evidence: paths.map(([path, line]) => ({ path: `source/${path}`, line })), source_owner: "primary", batch_eligible: false, measured_count: null, coverage: "not-applicable", claimed_resolved: [], related_ids: [], ...extra });
  const pr = (n: number) => `pr:example/project#${n}`;
  add(pr(11), "routine-batch-candidate", "propose-batch", [["notes/patch.md", 1], ["src/app.ts", 2]], { batch_eligible: true });
  add(pr(12), "major-migration", "separate-migration", [["notes/major.md", 1]]);
  add(pr(13), "breaking-pre-one", "separate-migration", [["notes/pre-one.md", 1]]);
  add(pr(14), "repair-required", "repair-before-readiness", [["notes/removed.md", 1], ["src/app.ts", 2]]);
  add(pr(15), "pin-mismatch", "hold-pin", [["notes/tag-reference.json", 1], [".github/workflows/pinned.yml", 1]]);
  add(pr(16), "mixed-ownership", "split-or-owner-decision", [[".github/workflows/sync-demo.yml", 2], [".github/workflows/sync-demo.yml", 3]], { source_owner: "mixed" });
  add(pr(17), "superseded-sync", "propose-close-superseded", [["versions.json", 1]]);
  for (const n of [18, 19]) add(pr(n), "overlap-distinct", "keep-both", [["notes/overlap.md", 1]], { related_ids: [pr(n === 18 ? 19 : 18)] });
  for (const n of [20, 21]) add(pr(n), "inventory-gap", "classify-before-selection", [["package.json", 1]]);
  add("alert:example/project:dependabot#77", "unresolved-remediation", "track-source-fix", [["notes/security.md", 1], ["src/security.ts", 2]], { coverage: "complete", measured_count: 1 });
  add("coverage:example/project:code_scanning", "expected-unavailable", "retain-n-a", [["security.md", 1]], { coverage: "complete-unavailable" });
  add("coverage:example/project:dependabot", "complete-comparable", "record-observation-diff", [], { coverage: "complete", measured_count: 1, claimed_resolved: ["dependabot:76"] });
  add("coverage:example/partial:dependabot", "incomplete-security", "retain-unknown", [["security.md", 1]], { source_owner: "independent", coverage: "incomplete" });
  add("history:example/no-history:dependabot", "history-unavailable", "establish-new-baseline", [["security.md", 1]], { source_owner: "independent", coverage: "complete", measured_count: 0 });
  add("dashboard:example/project#99", "queued-work", "reconcile-coverage", []);
  add("repository:example/new-repository", "inventory-gap", "classify-before-selection", [[".github/workflows/sync-demo.yml", 4]], { source_owner: "unknown" });
  const historical = { schema_version: 1, run_id: "00000000-0000-4000-8000-000000000001", created_at: "2026-10-01T00:00:00Z", observations: [{ hostname: "github.com", repository: "example/project", surface: "dependabot", scope: { state: "open", filters: [], exclusions: [] }, observed_at: "2026-10-01T00:00:00Z", source_reference: "synthetic-prior", status: "complete", reason: null, count: 2, alerts: [76, 77].map(number => ({ number, identity: `dependabot:${number}`, package: "unsafe-lib", manifest: "package.json", severity: "high" })) }] };
  const historyText = "## Security alerts\n\n```maintenance-observation-v1\n" + JSON.stringify(historical) + "\n```\n";
  evidence["history/0000.md"] = historyText;
  const { root: _root, ...portableSettings } = config;
  evidence["settings.json"] = canonicalJSON({ ...portableSettings, root: "source" }) + "\n";
  const bindInventory = (inventory: unknown) => {
    const encoded = jsonEvidence(inventory); evidence["inventory.json"] = encoded.text;
    const lines = evidence["inventory.json"].split("\n");
    for (const row of cases) {
      const number = row.id.match(/^pr:example\/project#(\d+)$/)?.[1];
      const query = number ? `"number": ${number},` : row.id.startsWith("alert:") || row.id === "coverage:example/project:dependabot" ? '"number": 77,' : row.id.endsWith(":code_scanning") ? '"status": "complete-unavailable"' : row.id.includes("partial") ? '"status": "incomplete"' : row.id.startsWith("dashboard:") ? '"number": 99,' : row.id.includes("no-history") ? '"repository": "example/no-history"' : '"repository": "example/new-repository"';
      const line = lines.findIndex(text => text.includes(query)) + 1;
      if (!line) throw Error("corpus evidence binding missing");
      if (row.classification === "inventory-gap" || row.classification === "incomplete-security" || row.classification === "history-unavailable") row.evidence = [];
      const coverage = coverageEvidence(inventory, row.id, encoded);
      if (coverage) {
        row.evidence.push({ path: "inventory.json", ...coverage });
      } else if (row.id.startsWith("pr:")) {
        const index = (inventory as any).repositories.findIndex((entry: any) => entry.repository === row.id.slice(3).split("#")[0]);
        const pullIndex = (inventory as any).repositories[index].pulls.findIndex((entry: any) => entry.number === Number(row.id.split("#")[1]));
        row.evidence.push({ path: "inventory.json", ...encoded.at("repositories", index, "pulls", pullIndex) });
      } else row.evidence.push({ path: "inventory.json", line });
      if (row.claimed_resolved.length || row.classification === "history-unavailable") row.evidence.push({ path: "history/0000.md", line: 4 });
      if (row.id.startsWith("repository:")) row.evidence.push({ path: "settings.json", line: 1 });
    }
  };
  return { project, config, env, cases, evidence, bindInventory, requests: () => readFileSync(env.MAINTENANCE_FAKE_LOG, "utf8").trim().split("\n").map(line => JSON.parse(line)), requestsDigest: () => digest(readFileSync(env.MAINTENANCE_FAKE_LOG)),
    packet: { run_id: run.header.run_id, synthetic_input: true, component: { root: join(project.root, component), commit }, source_paths: ["src", "package.json", "versions.json", ".github", "security.md", ...(options.operatorInputs ? ["operator", "AGENTS.md"] : [])], release_paths: ["notes"],
      history: [{ path: "synthetic-prior.md", provenance: "local" as const, digest: digest(historyText), text: historyText }], output: join(output, "packet") } };
}
