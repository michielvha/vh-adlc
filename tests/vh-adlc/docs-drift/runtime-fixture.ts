/** Ordinary installed toy clients and a flat preflight. No real model or hosted execution. */
import type { EntryIdentities, LegacyPublisherEntry } from "../../../plugins/vh-adlc/scripts/docs-drift/identity";
import type { IdentitySource } from "../../../plugins/vh-adlc/scripts/docs-drift/settings";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ordinaryComponentFixture, preflightFixture } from "./preflight-fixture";
import { put } from "./repository-fixture";

export type RuntimeRole = { model: string; identity_source: IdentitySource | null; native_model?: string;
  argv?: string[]; client_program?: string; provider?: "copilot" | "claude" };
export type RuntimePublisher = { entry: LegacyPublisherEntry; identities: EntryIdentities };
export type RuntimeSource = { repo: string; configured: Parameters<NonNullable<Parameters<typeof preflightFixture>[3]>>[1] };

export async function runtimeFixture(roots: string[], options: { bounded?: boolean; role?: RuntimeRole; fullComponent?: boolean;
  legacy_ids?: number[]; publisher?: RuntimePublisher; configureSource?: (fixture: RuntimeSource) => void } = {}) {
  const component = ordinaryComponentFixture(roots, options.fullComponent ?? true), role = options.role;
  const provider = role?.provider ?? "copilot", executable = component.executable;
  const program = join(component.root, "native-role-program");
  writeFileSync(program, role?.client_program ?? "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  const version = provider === "claude" ? "1.0.0 (Claude Code)" : "GitHub Copilot CLI 1.0.112.";
  const flags = provider === "claude"
    ? "--plugin-dir --model --session-id --output-format --tools --setting-sources --strict-mcp-config --no-session-persistence"
    : "--plugin-dir --model --session-id --output-format --available-tools --no-custom-instructions --disable-builtin-mcps";
  writeFileSync(executable, `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes("--version")) { console.log(${JSON.stringify(version)}); process.exit(0); }
if (args.includes("--help")) { console.log(${JSON.stringify(flags)}); process.exit(0); }
const result = Bun.spawnSync([${JSON.stringify(program)}, ...args], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
process.exitCode = result.exitCode;
`, { mode: 0o700 });
  const identities = options.publisher?.identities ?? Object.fromEntries(["hosted", "copilot", "claude", "interactive"]
    .map(entry => [entry, { actor: "fixture-bot", actor_id: 20 }]));
  const publishers: EntryIdentities = { ...identities, interactive: identities.interactive ?? identities.copilot };
  const models = { worker: role?.native_model ?? "claude-opus-5.5", reviewer: role?.native_model ?? "claude-opus-5.5" };
  const f = preflightFixture(roots, "none", { component: component.identity, executable, publishers, models }, (repo, configured) => {
    put(repo, "AGENTS.md", "Feature documents: docs/internal/plans/\n");
    configured.clients.copilot.provider = provider;
    configured.credential_references = provider === "claude" ? ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"] : ["COPILOT_GITHUB_TOKEN"];
    const original = configured.execution.entries.hosted;
    const selected = { worker: { ...original.worker, model: role?.model ?? "opus", argv: role?.argv ?? [] },
      reviewer: { ...original.reviewer, model: role?.model ?? "opus", argv: role?.argv ?? [] }, publisher: original.publisher };
    if (role) {
      Object.assign(selected.worker, { identity_source: role.identity_source });
      Object.assign(selected.reviewer, { identity_source: role.identity_source });
    }
    configured.execution.entries = { hosted: selected, interactive: selected };
    Object.assign(configured.execution.entries, { copilot: selected, claude: selected });
    configured.publication.actor = identities.hosted.actor;
    configured.publication.entry_actors = { hosted: identities.hosted.actor, interactive: publishers.interactive.actor };
    Object.assign(configured.publication.entry_actors, { copilot: identities.copilot.actor, claude: identities.claude.actor });
    configured.pr_discovery.authors = [...new Set(Object.values(publishers).map(identity => identity.actor))];
    configured.legacy_proposals.ids = options.legacy_ids ?? [];
    configured.reports.workflow_id = 19;
    Object.assign(configured.execution, { worker_workflow: ".github/workflows/docs-drift-worker.yml",
      scheduled_workflow: ".github/workflows/docs-drift.yml", claude_command: ".claude/commands/docs-drift.md", runner: "ubuntu-latest" });
    configured.feedback_files.push("docs/corrections.yaml");
    put(repo, "docs/corrections.yaml", "corrections: []\n");
    if (options.bounded) { configured.verification_commands = []; configured.read_set = { source_roots: ["src"], reference_roots: ["references"] }; }
    options.configureSource?.({ repo, configured });
  });
  const cache = join(f.root, "native-state"); mkdirSync(cache, { mode: 0o700 });
  const entry = options.publisher?.entry ?? "copilot";
  return { ...f, configured: f.afterSettings, retained: { directory: component.directory }, native_component: component,
    selection: { repo: f.repo, current_default: f.head(), identity: { repository: "fixture/docs", repository_id: 10,
      ...publishers[entry], default_branch: "main" }, cache_directory: cache, entry,
      launcher_path: join(f.repo, "scripts/entry.txt"), settings_path: join(f.repo, ".vh-adlc/docs-drift.yaml") } };
}

/** Open the same installed run origin and invocation scope used by the normal command entry. */
export async function nativeInvocationFixture(options: Parameters<typeof import("../../../plugins/vh-adlc/scripts/docs-drift/run-directory").createRunDirectory>[0]
  & { component_directory: string }) {
  const runs: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/run-directory") = await import(join(options.component_directory, "scripts/docs-drift/run-directory.ts"));
  const runtime: typeof import("../../../plugins/vh-adlc/scripts/docs-drift/bootstrap") = await import(join(options.component_directory, "scripts/docs-drift/bootstrap.ts"));
  runs.createRunDirectory(options);
  return {
    invoke<T>(work: (run: ReturnType<typeof runs.readRunDirectory>) => Promise<T>): Promise<T> {
      return runtime.withRuntimeValidation(() => work(runs.readRunDirectory(options)));
    },
  };
}

export function nativeReader(f: { root: string; candidate: string; inventory_path?: string }, actor = "fixture-bot", errors = false, incompleteInventory = false, actorID = 20) {
  const bin = join(f.root, "native-bin"), trace = join(f.root, "native-reads.jsonl");
  mkdirSync(bin, { mode: 0o700 });
  writeFileSync(join(bin, "gh"), `#!${process.execPath}
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2), endpoint = args.find(value => value.startsWith("repos/") || value.startsWith("user/"));
appendFileSync(${JSON.stringify(trace)}, JSON.stringify({ args, provider: process.env.COPILOT_GITHUB_TOKEN ?? null,
  credential: process.env.GH_TOKEN === "synthetic-read-token", enterprise: process.env.GH_ENTERPRISE_TOKEN === "synthetic-read-token" }) + "\\n");
if (args.includes("graphql")) {
  console.log(JSON.stringify({ data: { viewer: { login: ${JSON.stringify(actor)}, databaseId: ${actorID} } },
    ...(${errors} ? { errors: [{ message: "Synthetic incomplete viewer" }] } : {}) }));
} else {
  if (args[args.indexOf("--method") + 1] !== "GET") process.exit(91);
  const sha = ${JSON.stringify(f.candidate)};
  const value = endpoint === ${JSON.stringify("user/" + actorID)} ? { login: ${JSON.stringify(actor)}, id: ${actorID} }
    : endpoint === "repos/fixture/docs" ? { id: 10, full_name: "fixture/docs", default_branch: "main" }
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
