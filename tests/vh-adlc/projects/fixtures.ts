import { afterEach } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GitHub } from "../../../plugins/vh-adlc/scripts/projects/github";
import { parseSettings } from "../../../plugins/vh-adlc/scripts/projects/settings";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
export const page = (nodes: unknown[], next = false, cursor: string | null = null) => ({ nodes, pageInfo: { hasNextPage: next, endCursor: cursor } });
export function fixture(steps: unknown[], budget = 100) {
  const dir = mkdtempSync(join(tmpdir(), "projects-gh-")); roots.push(dir);
  const state = join(dir, "state.json"); writeFileSync(state, JSON.stringify({ steps }));
  const executable = join(dir, "gh");
  writeFileSync(executable, `#!/usr/bin/env bash\nexec '${process.execPath}' '${resolve(import.meta.dir, "fake-gh.ts")}' "$@"\n`); chmodSync(executable, 0o755);
  return { dir, state, gh: new GitHub(budget, { executable, env: { ...process.env, PROJECTS_FIXTURE: state } }), calls: () => readFileSync(state + ".calls", "utf8").trim().split("\n").map(line => JSON.parse(line)) };
}
export const settings = () => parseSettings({ schema_version: 1, project: "https://github.com/orgs/example/projects/1", repositories: ["example/one", "other/two"], fields: [{ name: "Status", options: ["todo", "done"] }] });
export const issue = (id = "I_1", repository = "example/one") => ({ id, number: 1, url: `https://github.com/${repository}/issues/1`, title: "$(do-not-run) instructions are data", state: "OPEN", stateReason: null, repository: { nameWithOwner: repository } });
export const field = { id: "F_1", name: "Status", options: [{ id: "todo" }, { id: "done" }] };
export const boardStep = () => ({ operation: "ProjectFields", response: { data: { organization: { projectV2: { id: "P_1", url: settings().project, title: "Example", fields: page([field]) } } } } });
export const itemsStep = (nodes: unknown[] = []) => ({ operation: "ProjectItems", response: { data: { node: { id: "P_1", items: page(nodes) } } } });
export const repoStep = (name: string, nodes: unknown[], next = false, cursor: string | null = null) => ({ operation: "RepositoryIssues", response: { data: { repository: { nameWithOwner: name, issues: page(nodes, next, cursor) } } } });
export const relationsStep = (prs: unknown[] = [], blocked: unknown[] = []) => ({ operation: "IssueRelations", response: { data: { node: { closedByPullRequestsReferences: page(prs), blockedBy: page(blocked) } } } });

