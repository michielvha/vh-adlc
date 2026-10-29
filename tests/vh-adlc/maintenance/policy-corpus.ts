import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { jsonEvidence, coverageEvidence } from "./json-evidence";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { syntheticCorpus } from "./fixtures/corpus";
import { git } from "./fixtures";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/maintenance/settings";
import { createRun, digest } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import type { ExpectedCase } from "./trial-proof";
export function stackweaverPolicyCorpus(consumer: { root: string; commit: string }, operatorInputs: (root: string) => Record<string, string>) {
  if (git(consumer.root, "rev-parse", consumer.commit) !== consumer.commit) throw Error("exact committed consumer policy required");
  const corpus = syntheticCorpus({ operatorInputs }), root = corpus.project.root;
  const frozen = (path: string) => { const result = Bun.spawnSync(["git", "-C", consumer.root, "show", `${consumer.commit}:${path}`], { stdout: "pipe", stderr: "pipe" }); if (result.exitCode !== 0) throw Error("declared consumer policy missing"); return result.stdout.toString(); };
  const settings = JSON.parse(frozen(".vh-adlc/maintenance.json"));
  if (settings.repository !== "michielvha/stackweaver") throw Error("this bounded acceptance fixture requires Stackweaver policy");
  const replace = (text: string) => text.replaceAll("example/project", settings.repository).replaceAll("example/partial", "vhco-pro/terraform-provider-stackweaver").replaceAll("example/no-history", "vhco-pro/stackweaver-registry").replaceAll("example/new-repository", "vhco-pro/fixture-new-repository");
  // Policy and routing are real; caller samples, release notes, tracker state and history remain synthetic.
  const paths = [...new Set(["AGENTS.md", ".vh-adlc/maintenance.json", "agents/maintenance.md", ".claude/commands/maintenance.md", settings.project_procedure, ...settings.source_references, ...settings.backlog_references, ...settings.repositories.map((row: any) => row.sync_workflow).filter(Boolean)])] as string[];
  for (const path of paths) corpus.project.write(path, frozen(path));
  for (const path of ["src/app.ts", "src/security.ts", "package.json", "versions.json", "security.md", ...Object.keys(corpus.evidence).filter(path => path.startsWith("source/notes/")).map(path => path.slice(7))]) corpus.project.write(path, replace(readFileSync(join(root, path), "utf8")));
  corpus.project.write("frontend/src/fixture.ts", "// Synthetic source sample; production callers were not exported.\nexport const frontendFixture = true;\n");
  corpus.project.write("notes/consumer-routing.md", "Synthetic frontend PR 22 changes package.json and remains sync-owned by the monorepo. Synthetic API PR 23 changes Dockerfile, which the actual API sync excludes. Both need owner selection and applicable checks; production call-site compatibility is unverified from these samples.\n");
  const routesPath = corpus.env.MAINTENANCE_FAKE_ROUTES, routes = JSON.parse(replace(readFileSync(routesPath, "utf8")));
  const primary = settings.repository, sha = "a".repeat(40);
  routes[`repos/${primary}/code-scanning/alerts`].body.message = "Advanced Security must be enabled";
  const dashboard = routes[`repos/${primary}/issues/99`]; routes[`repos/${primary}/issues`] = [dashboard];
  for (const [index, row] of settings.repositories.entries()) {
    const repository = row.repository;
    routes[`repos/${repository}`] ??= { id: 100 + index, full_name: repository, default_branch: "main" };
    routes[`repos/${repository}/pulls`] ??= [];
    for (const surface of ["dependabot", "code-scanning"]) routes[`repos/${repository}/${surface}/alerts`] ??= [];
  }
  routes["orgs/vhco-pro/repos"] = [...settings.repositories.map((row: any) => row.repository), "vhco-pro/fixture-new-repository"].map(full_name => ({ full_name, archived: false })); delete routes["orgs/example/repos"];
  for (const [repository, number, filename, title] of [["vhco-pro/stackweaver-frontend", 22, "package.json", "fixture frontend synced patch"], ["vhco-pro/stackweaver-api", 23, "Dockerfile", "fixture API-owned builder patch"]] as const) {
    const pull = { number, title, body: "Synthetic policy routing example; no live compatibility claim. See notes/consumer-routing.md.", state: "open", draft: false, changed_files: 1, user: { login: "renovate[bot]", type: "Bot" }, head: { sha }, base: { sha: "b".repeat(40), ref: "main", repo: { full_name: repository } } };
    routes[`repos/${repository}/pulls`] = [pull]; routes[`repos/${repository}/pulls/${number}`] = pull;
    routes[`repos/${repository}/pulls/${number}/files`] = [{ filename, status: "modified", patch: "+synthetic policy fixture" }];
    routes[`repos/${repository}/commits/${sha}/check-runs`] = { total_count: 1, check_runs: [{ id: number, head_sha: sha, name: "synthetic-CI", status: "completed", conclusion: "success" }] };
    routes[`repos/${repository}/commits/${sha}/check-suites`] = { total_count: 1, check_suites: [{ id: number, head_sha: sha }] };
    routes[`repos/${repository}/commits/${sha}/status`] = { total_count: 0, state: "pending", sha, statuses: [] };
  }
  for (const [path, text] of Object.entries(operatorInputs(root))) if (path.startsWith("operator/")) corpus.project.write(path, text);
  corpus.project.write("operator/consumer-policy.json", JSON.stringify({ repository: settings.repository, commit: consumer.commit, paths: paths.map(path => ({ path, sha256: digest(frozen(path)) })), tracker_and_history: "synthetic only", production_source: "bounded synthetic caller samples only" }, null, 2) + "\n");
  git(root, "remote", "set-url", "origin", `https://github.com/${primary}.git`);
  git(root, "add", "operator", ...paths, "frontend", "src", "package.json", "versions.json", "security.md", "notes"); git(root, "commit", "-qm", "test: bounded committed Stackweaver maintenance policy with synthetic tracker samples");
  const commit = git(root, "rev-parse", "HEAD");
  for (const key of Object.keys(routes)) if (/\/pulls\/\d+$/.test(key) || key === `repos/${primary}/pulls`) {
    const values = Array.isArray(routes[key]) ? routes[key] : [routes[key]]; for (const value of values) if (value.base?.repo?.full_name === primary) value.base.sha = commit;
  }
  writeFileSync(routesPath, JSON.stringify(routes));
  corpus.config = loadSettings(root); const run = createRun(corpus.config);
  corpus.packet.run_id = run.header.run_id;
  corpus.packet.source_paths = [...new Set([...corpus.packet.source_paths, ...paths, "frontend"])];
  corpus.packet.history = corpus.packet.history.map(row => { const text = replace(row.text); return { ...row, text, digest: digest(text) }; });
  for (let index = 0; index < corpus.cases.length; index++) corpus.cases[index] = JSON.parse(replace(JSON.stringify(corpus.cases[index])));
  for (const key of Object.keys(corpus.evidence)) corpus.evidence[key] = replace(corpus.evidence[key]);
  for (const path of [...paths, "frontend/src/fixture.ts", "notes/consumer-routing.md"]) corpus.evidence[`source/${path}`] = readFileSync(join(root, path), "utf8");
  corpus.evidence["history/0000.md"] = corpus.packet.history[0].text;
  const line = (path: string, term: string) => { const number = corpus.evidence[`source/${path}`].split("\n").findIndex(value => value.includes(term)) + 1; if (!number) throw Error("actual workflow routing evidence absent"); return number; };
  for (const [id, classification, proposal, owner, path, term] of [["pr:vhco-pro/stackweaver-frontend#22", "sync-owned", "route-to-monorepo", "primary", ".github/workflows/sync-frontend.yml", "monorepo/frontend/ satellite/"], ["pr:vhco-pro/stackweaver-api#23", "satellite-owned", "retain-satellite", "satellite", ".github/workflows/sync-api.yml", "rsync -av --mkpath"]]) corpus.cases.push({ id, classification, proposal, source_owner: owner, batch_eligible: false, measured_count: null, coverage: "not-applicable", claimed_resolved: [], related_ids: [], evidence: [{ path: `source/${path}`, line: line(path, term), ...(id.endsWith("#23") ? { end_line: line(path, term) + 6 } : {}) }, { path: "source/notes/consumer-routing.md", line: 1 }] });
  const mixed = corpus.cases.find(row => row.id === `pr:${primary}#16`)!;
  mixed.evidence = [{ path: "source/.github/workflows/sync-frontend.yml", line: line(".github/workflows/sync-frontend.yml", "monorepo/frontend/ satellite/") }, { path: `source/${settings.project_procedure}`, line: line(settings.project_procedure, "Mixed ownership") }];
  const scanning = corpus.cases.find(row => row.id === `coverage:${primary}:code_scanning`)!;
  scanning.evidence = [{ path: `source/${settings.project_procedure}`, line: line(settings.project_procedure, "declared 403"), alternatives: [{ path: "settings.json", line: 1 }] }];
  const api = corpus.cases.find(row => row.id === "pr:vhco-pro/stackweaver-api#23")!;
  api.evidence = [{ path: "source/.github/workflows/sync-api.yml", line: line(".github/workflows/sync-api.yml", "Clean slate"), end_line: line(".github/workflows/sync-api.yml", "rsync -av --mkpath") + 6 }, { path: `source/${settings.project_procedure}`, line: line(settings.project_procedure, "own their builder Dockerfile") }];
  corpus.bindInventory = inventory => bindPolicyInventory(corpus.cases, corpus.evidence, inventory, corpus.config);
  return corpus;
}
function bindPolicyInventory(cases: ExpectedCase[], evidence: Record<string, string>, inventory: any, settings: any) {
  const encoded = jsonEvidence(inventory); evidence["inventory.json"] = encoded.text;
  evidence["settings.json"] = readSettings(settings);
  const lines = evidence["inventory.json"].split("\n");
  for (const row of cases) {
    const number = row.id.startsWith("pr:") || row.id.startsWith("dashboard:") ? row.id.split("#").at(-1) : undefined;
    const query = number ? `"number": ${number},` : row.classification === "incomplete-security" ? '"status": "incomplete"' : row.classification === "history-unavailable" ? '"repository": "vhco-pro/stackweaver-registry"' : row.id.endsWith(":code_scanning") ? '"status": "complete-unavailable"' : row.id.startsWith("repository:") ? '"repository": "vhco-pro/fixture-new-repository"' : '"number": 77,';
    const line = lines.findIndex(text => text.includes(query)) + 1; if (!line) throw Error(`policy corpus item absent from actual collector output: ${row.id}`);
    row.evidence = row.evidence.filter(item => item.path !== "inventory.json" && item.path !== "settings.json");
    if (["inventory-gap", "incomplete-security", "history-unavailable"].includes(row.classification)) row.evidence = [];
    const coverage = coverageEvidence(inventory, row.id, encoded);
    if (coverage) {
      row.evidence.push({ path: "inventory.json", ...coverage });
    } else if (row.id.startsWith("pr:")) {
      const index = inventory.repositories.findIndex((entry: any) => entry.repository === row.id.slice(3).split("#")[0]);
      const pullIndex = inventory.repositories[index].pulls.findIndex((entry: any) => entry.number === Number(row.id.split("#")[1]));
      row.evidence.push({ path: "inventory.json", ...encoded.at("repositories", index, "pulls", pullIndex) });
    } else row.evidence.push({ path: "inventory.json", line });
    if ((row.claimed_resolved.length || row.classification === "history-unavailable") && !row.evidence.some(item => item.path === "history/0000.md")) row.evidence.push({ path: "history/0000.md", line: 4 });
    if (row.id.startsWith("repository:")) row.evidence.push({ path: "settings.json", line: 1 });
  }
}
function readSettings(settings: any) { const { root: _root, ...rest } = settings; return canonicalJSON({ ...rest, root: "source" }) + "\n"; }
