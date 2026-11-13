/** Toy retained runtimes for helper and normal CLI controls. No model or hosted execution. */
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as bootstrap from "../../../plugins/vh-adlc/scripts/docs-drift/bootstrap";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { parseClientBinding, type IdentitySource } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";
import { fullDefinitionUpgradeFixture, trialDefinitionFixture } from "./trial-definition-fixture";
import { publicationFixture } from "./publication-fixture";
import { commit, pin, runtimeIdentity, write } from "./adoption-fixture";
import { settingsFixture } from "./settings-fixture";

export async function runtimeFixture(roots: string[], upgrade = false, bounded = false, role?: { model: string; identity_source: IdentitySource | null; native_model?: string; argv?: string[]; client_program?: string }, fullComponent = false, legacyIDs?: number[]) {
  const shared = publicationFixture(roots), prefix = "plugins/vh-adlc/";
  if (fullComponent) cpSync(join(import.meta.dir, "../../../plugins/vh-adlc"), join(shared.repo, prefix), { recursive: true });
  if (fullComponent) write(shared.repo, prefix + "plugin.json", '{"name":"vh-adlc","version":"0.13.0"}\n');
  write(shared.repo, prefix + ".claude-plugin/plugin.json", '{"name":"vh-adlc","version":"0.13.0"}\n');
  write(shared.repo, prefix + "scripts/runner.ts", "// Synthetic candidate worker\n");
  const source = commit(shared.repo, "synthetic shared candidate"), component = bootstrap.computeComponentIdentity(shared.repo, source);
  const componentPin = { ...pin(), source_commit: source, plugin_version: component.plugin_version, component_sha256: component.component_sha256 };
  const distribution = Buffer.from(role?.client_program ?? "#!/bin/sh\nprintf '%s\\n' 'GitHub Copilot CLI fixture-1.0.0.'\n");
  const client = parseClientBinding({ ...settingsFixture().clients["copilot-linux"], platform: process.platform + "-" + process.arch,
    distribution_sha256: sha256(distribution) });
  const candidateDistribution = upgrade ? Buffer.from(distribution.toString().replace("fixture-1.0.0", "fixture-2.0.0")) : distribution;
  const candidateClient = upgrade ? { ...client, version: "fixture-2.0.0", distribution_sha256: sha256(candidateDistribution) } : client;
  const approvedSource = { pin: componentPin, client, bounded, role, legacy_ids: legacyIDs };
  const f = upgrade ? fullDefinitionUpgradeFixture(roots, { approved: approvedSource, candidate_client: candidateClient })
    : trialDefinitionFixture(roots, { approved: approvedSource });
  const current = "policySource" in f ? f.policySource : f.staged;
  if (typeof current !== "string") throw Error("missing synthetic trial policy source");
  readGit(f.repo, "switch", "--detach", current);
  const cache = join(f.root, "runtime-cache"); mkdirSync(cache, { mode: 0o700 });
  const retained = bootstrap.retainComponentSnapshot({ cache_directory: cache, consumer_repo: f.repo, source_repo: shared.repo, pin: componentPin });
  const scope = { hostname: f.configured.hostname, repository_id: 10, actor_id: 20, entry: "copilot" as const };
  const setup = { consumer_repo: f.repo, cache_directory: cache, client_id: "copilot-linux", client, profile_scope: scope,
    distribution, format: "executable" as const, executable: "copilot" };
  const approved = await bootstrap.retainClientDistribution(setup);
  writeFileSync(join(approved.profile_directory, "session-marker"), "Synthetic approved session\n");
  const native = await bootstrap.retainClientDistribution({ ...setup, client: candidateClient, distribution: candidateDistribution, profile_scope: { ...scope,
    trial: { definition_sha256: f.trial.definition_sha256, fixture_id: f.definition.fixture.id } } });
  const selection = { repo: f.repo, current_default: current, identity: runtimeIdentity, cache_directory: cache,
    entry: "copilot" as const, definition_sha256: f.trial.definition_sha256,
    launcher_path: join(f.repo, f.candidate_settings.runtime_loader.launcher), settings_path: join(f.repo, f.definition.candidate_settings.path) };
  return { ...f, setup, retained, native, approved, selection };
}


export function nativeReader(f: { root: string; candidate: string; inventory_path?: string }, actor = "fixture-bot", errors = false, incompleteInventory = false) {
  const bin = join(f.root, "native-bin"), trace = join(f.root, "native-reads.jsonl");
  mkdirSync(bin, { mode: 0o700 });
  writeFileSync(join(bin, "gh"), `#!${process.execPath}
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2), endpoint = args.find(value => value.startsWith("repos/"));
appendFileSync(${JSON.stringify(trace)}, JSON.stringify({ args, provider: process.env.COPILOT_GITHUB_TOKEN ?? null,
  credential: process.env.GH_TOKEN === "synthetic-read-token", enterprise: process.env.GH_ENTERPRISE_TOKEN === "synthetic-read-token" }) + "\\n");
if (args.includes("graphql")) {
  console.log(JSON.stringify({ data: { viewer: { login: ${JSON.stringify(actor)}, databaseId: 20 } },
    ...(${errors} ? { errors: [{ message: "Synthetic incomplete viewer" }] } : {}) }));
} else {
  if (args[args.indexOf("--method") + 1] !== "GET") process.exit(91);
  const sha = ${JSON.stringify(f.candidate)};
  const value = endpoint === "repos/fixture/docs" ? { id: 10, full_name: "fixture/docs", default_branch: "main" }
    : endpoint === "repos/fixture/docs/git/ref/heads/main" ? { ref: "refs/heads/main", object: { type: "commit", sha } }
    : endpoint === "repos/fixture/docs/git/commits/" + sha ? { sha, tree: { sha: "a".repeat(40) }, parents: [], message: "Synthetic source" }
    : endpoint === "repos/fixture/docs/pulls?state=open&base=main&per_page=100&page=1" ? (${incompleteInventory} ? { message: "Synthetic missing inventory" } : ${f.inventory_path ? `JSON.parse(require("node:fs").readFileSync(${JSON.stringify(f.inventory_path)}, "utf8"))` : "[]"})
    : ${f.inventory_path ? `endpoint?.startsWith("repos/fixture/docs/pulls/") ? JSON.parse(require("node:fs").readFileSync(${JSON.stringify(f.inventory_path)}, "utf8")).find(item => item.number === Number(endpoint.split("/").at(-1))) : null` : "null"};
  if (!value) process.exit(92);
  console.log("HTTP/2.0 200 OK\\r\\n\\r\\n" + JSON.stringify(value));
}
`, { mode: 0o700 });
  return { trace, environment: { ...process.env, PATH: bin + ":" + process.env.PATH,
    GH_TOKEN: "synthetic-read-token", COPILOT_GITHUB_TOKEN: "synthetic-provider-canary" } };
}
