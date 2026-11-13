// Invoked as a subprocess in place of gh. Serves a small GitHub REST model from a JSON state file.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const path = process.env.BRANCHES_FIXTURE;
if (!path) throw new Error("fixture path missing");
type Pull = { number: number; state: string; merged_at: string | null; head: { ref: string; sha: string; repo: { full_name: string } }; base: { ref: string } };
const state = JSON.parse(readFileSync(path, "utf8")) as { repository: string; repo: Record<string, unknown>; protected: string[]; pulls: Pull[]; fail?: string[]; ignore_patch?: boolean };
const args = process.argv.slice(2);
appendFileSync(path + ".calls", JSON.stringify(args) + "\n");
const method = args.includes("-X") ? args[args.indexOf("-X") + 1] : "GET";
const endpoint = args.find((arg, i) => i > 0 && arg.startsWith("repos/"));
if (args[0] !== "api" || !endpoint) { process.stderr.write("unexpected fixture request"); process.exit(1); }
if (state.fail?.some(prefix => endpoint.startsWith(prefix))) { process.stderr.write("fixture API refusal"); process.exit(1); }
const [route, query = ""] = endpoint.split("?");
const params = new URLSearchParams(query), base = `repos/${state.repository}`;
const emit = (value: unknown) => {
  const lines = args.includes("--jq") ? (value as unknown[]).map(v => JSON.stringify(v)).join("\n") : JSON.stringify(value);
  process.stdout.write(lines + "\n");
};
if (route === base && method === "PATCH") {
  if (!state.ignore_patch) state.repo.delete_branch_on_merge = true;
  writeFileSync(path, JSON.stringify(state));
  emit(state.repo);
} else if (route === base) emit(state.repo);
else if (route === `${base}/branches`) emit(state.protected.map(name => ({ name, protected: true })));
else if (route === `${base}/pulls` && params.get("state") === "open") emit(state.pulls.filter(p => p.state === "open"));
else if (route === `${base}/pulls`) {
  const [owner, ref] = params.get("head")!.split(/:(.*)/s);
  emit(state.pulls.filter(p => p.state === "closed" && p.head.ref === ref && p.head.repo.full_name.split("/")[0] === owner));
} else if (route!.startsWith(`${base}/pulls/`)) {
  const found = state.pulls.find(p => String(p.number) === route!.slice(`${base}/pulls/`.length));
  if (!found) { process.stderr.write("HTTP 404"); process.exit(1); }
  emit(found);
} else { process.stderr.write("unexpected fixture route"); process.exit(1); }
