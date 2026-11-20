// Explicit native trial for the exact candidate. Ordinary Bun tests launch neither client.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runOwnedClient } from "../../../plugins/vh-adlc/scripts/triage/owned-process";
import { fixture, git, REF, SPEC, type Env, type Reply } from "./fixture";

type Client = "codex" | "claude";
type Log = { command: string; exit: number; stdout: string; stderr: string };
const COMPONENT = "plugins/vh-adlc";
export const CATALOGS = [".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"];

export function payloadDigest(root: string): string {
  const hash = createHash("sha256");
  function visit(dir: string, prefix = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const name = prefix + entry.name;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path, name + "/");
      else if (entry.isFile()) hash.update(JSON.stringify([name, statSync(path).mode & 0o777, createHash("sha256").update(readFileSync(path)).digest("hex")]) + "\n");
      else throw Error("candidate payload contains an unsupported Git entry");
    }
  }
  visit(root);
  return hash.digest("hex");
}

function installPath(cache: string, expectedDigest: string): string {
  if (!existsSync(cache)) throw Error("native client did not create an installed plugin cache");
  const matched: string[] = [];
  function visit(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) {
      const path = join(dir, entry.name);
      if (existsSync(join(path, "scripts/ownership/cli.ts")) && existsSync(join(path, "plugin.json"))) {
        if (payloadDigest(path) === expectedDigest) matched.push(path);
      } else visit(path);
    }
  }
  visit(cache);
  if (matched.length !== 1 || !matched[0]) throw Error("expected one native installed cache matching the exact candidate");
  return matched[0];
}

function transcriptId(client: Client, text: string): string {
  for (const line of text.split("\n").filter(line => line.startsWith("{"))) {
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    const id = client === "codex" && record.type === "thread.started" ? record.thread_id : client === "claude" ? record.session_id : undefined;
    if (typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id)) return id;
  }
  throw Error("native trial did not return a session ID");
}

function quote(value: string): string { return "'" + value.replaceAll("'", "'\\''") + "'"; }

async function trial(client: Client, repository: string, commit: string, output: string, scenarios: boolean) {
  const repo = resolve(repository), root = resolve(output);
  if (existsSync(root)) throw Error("choose a new directory for trial outputs");
  if (!/^[a-f0-9]{40}$/.test(commit) || git(repo, process.env, "rev-parse", "HEAD") !== commit || git(repo, process.env, "status", "--porcelain=v1")) {
    throw Error("native trial needs a clean checkout of its exact candidate commit");
  }
  const catalog = join(root, "catalog");
  const privateProfile = join(root, "profile");
  const logs = join(root, "logs");
  mkdirSync(logs, { recursive: true, mode: 0o700 });
  mkdirSync(catalog, { mode: 0o700 });
  mkdirSync(privateProfile, { mode: 0o700 });
  const archive = Bun.spawnSync(["git", "-C", repo, "archive", commit, COMPONENT, ...CATALOGS], { stdout: "pipe", stderr: "pipe" });
  if (archive.exitCode !== 0 || Bun.spawnSync(["tar", "-x", "-C", catalog], { stdin: archive.stdout, stdout: "pipe", stderr: "pipe" }).exitCode !== 0) {
    throw Error("could not export the exact marketplace candidate");
  }
  const expected = payloadDigest(join(catalog, COMPONENT));
  const catalogFile = CATALOGS[client === "codex" ? 0 : 1]!;
  const { name } = JSON.parse(readFileSync(join(catalog, catalogFile), "utf8")) as { name: string };
  const apiKey = client === "codex" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  const env: Env = { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: join(privateProfile, "home"),
    CODEX_HOME: join(privateProfile, "codex"), CLAUDE_CONFIG_DIR: join(privateProfile, "claude"),
    XDG_CACHE_HOME: join(privateProfile, "cache"), BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0",
    ...(scenarios && process.env[apiKey] ? { [apiKey]: process.env[apiKey] } : {}) };
  for (const path of [env.HOME, env.CODEX_HOME, env.CLAUDE_CONFIG_DIR]) mkdirSync(path!, { recursive: true, mode: 0o700 });
  const receipt: { source: string; client: Client; catalog: string; payload: string; installed?: string; scenario: string; stages: Log[] } =
    { source: commit, client, catalog: catalogFile, payload: expected, scenario: "pending", stages: [] };
  const persist = () => writeFileSync(join(root, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
  const invoke = async (id: string, argv: string[], cwd: string, environment: Env, allow: number[] = [0]) => {
    const stdout = join(logs, id + ".stdout"), stderr = join(logs, id + ".stderr");
    const result = await runOwnedClient(argv, { cwd, env: Object.fromEntries(Object.entries(environment).filter((pair): pair is [string, string] => pair[1] !== undefined)), stdout, stderr },
      { timeout_ms: 120_000, grace_ms: 500, reap_ms: 2000 });
    receipt.stages.push({ command: id, exit: result.exit_code, stdout, stderr });
    persist();
    if (!allow.includes(result.exit_code) || result.timed_out || !result.confirmed) throw Error(`native stage ${id} failed; inspect its private receipt`);
    return readFileSync(stdout, "utf8");
  };
  await invoke("version", [client, "--version"], root, env);
  await invoke("catalog", [client, "plugin", "marketplace", "add", catalog, "--json"], root, env);
  await invoke("install", [client, "plugin", client === "codex" ? "add" : "install", `vh-adlc@${name}`, "--json"], root, env);
  await invoke("list", [client, "plugin", "list", "--json"], root, env);
  const installed = installPath(join(client === "codex" ? env.CODEX_HOME! : env.CLAUDE_CONFIG_DIR!, "plugins/cache"), expected);
  receipt.installed = installed;
  persist();

  const f = fixture();
  try {
    const cli = join(installed, "scripts/ownership/cli.ts");
    const fixtureEnv = { ...f.env, ...env };
    const initialize = JSON.parse(await invoke("installed-initialize", [process.execPath, cli, "initialize", "--repo", f.seed,
      "--approved", "true", "--operation", "native-fixture-setup"], f.seed, fixtureEnv)) as Reply;
    if (!initialize.genesis) throw Error("installed candidate did not initialize the disposable fixture");
    f.policy(initialize.genesis);
    if (!scenarios || !env[apiKey]) {
      receipt.scenario = scenarios ? "pending: no isolated native test credential" : "pending: session scenarios were not selected";
      persist();
      return receipt;
    }

    const a = f.clone("first"), b = f.clone("second");
    const sourceState = (path: string) => {
      const head = git(path, f.env, "rev-parse", "HEAD");
      const index = git(path, f.env, "rev-parse", "--path-format=absolute", "--git-path", "index");
      return `${head}:${createHash("sha256").update(readFileSync(index)).digest("hex")}`;
    };
    const before = new Map([a, b].map(path => [path, sourceState(path)]));
    const nativeEnv = { ...fixtureEnv, CODEX_THREAD_ID: undefined, CODEX_SESSION_ID: undefined, CLAUDECODE: undefined, CLAUDE_CODE_SESSION_ID: undefined };
    async function entry(id: string, cwd: string, expectedStatus: string, args: string[], resume?: string, extra: Env = {}) {
      const result = join(logs, id + ".decision.json");
      const command = [process.execPath, cli, ...args, "--repo", cwd];
      const shell = command.map(quote).join(" ") + " > " + quote(result);
      const prompt = "Run this one Bash command. It performs a disposable ownership fixture check. Return its result and make no other changes.\n" + shell;
      const argv = client === "codex"
        ? [client, "exec", "-c", 'shell_environment_policy.inherit="all"', "--sandbox", "workspace-write", "--add-dir", f.root,
          "--json", ...(resume ? ["resume", resume] : []), prompt]
        : [client, "-p", "--output-format", "stream-json", "--verbose", "--allowedTools", "Bash", ...(resume ? ["--resume", resume] : []), "--", prompt];
      const raw = await invoke(id, argv, cwd, { ...nativeEnv, ...extra });
      const decision = JSON.parse(readFileSync(result, "utf8")) as Reply;
      if (decision.status !== expectedStatus || sourceState(cwd) !== before.get(cwd) ||
          git(cwd, f.env, "status", "--porcelain=v1")) throw Error(`unexpected native writer result or fixture mutation at ${id}`);
      return { id: transcriptId(client, raw), decision };
    }

    const target = ["--spec", SPEC];
    const started = await entry("start", a, "entered", ["enter", ...target]);
    const tip = f.git(f.bare, "rev-parse", REF);
    await entry("resume", a, "entered", ["enter", ...target], started.id);
    const other = await entry("competing", b, "held", ["enter", ...target]);
    const mixed = client === "codex" ? { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "fixture-parent" } : { CODEX_THREAD_ID: "fixture-parent" };
    await entry("mixed", a, "held", ["enter", ...target], undefined, mixed);
    if (f.git(f.bare, "rev-parse", REF) !== tip || !started.decision.operation || started.id === other.id) throw Error("resume or a conflicting session changed the reservation");
    await entry("handoff", b, "transferred", ["handoff", ...target, "--expected-operation", started.decision.operation,
      "--operation", "native-handoff", "--approved", "true", "--stopped", "true", "--preserved", "true"], other.id);
    await entry("old-writer", a, "held", ["enter", ...target], started.id);
    await entry("new-writer", b, "entered", ["enter", ...target], other.id);
    receipt.scenario = "passed";
    persist();
    return receipt;
  } finally {
    f.cleanup();
  }
}

if (import.meta.main) {
  const [client, repo, commit, output, mode] = process.argv.slice(2);
  if ((client !== "codex" && client !== "claude") || !repo || !commit || !output || (mode !== undefined && mode !== "--scenarios")) {
    throw Error("usage: native-trial.ts codex|claude REPOSITORY COMMIT NEW-OUTPUT-DIR [--scenarios]");
  }
  const result = await trial(client, repo, commit, output, mode === "--scenarios");
  console.log(JSON.stringify(result, null, 2));
  if (mode === "--scenarios" && result.scenario !== "passed") process.exitCode = 3;
}
