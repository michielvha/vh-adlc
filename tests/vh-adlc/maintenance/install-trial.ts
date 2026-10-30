// Native installers run only through the explicit CLI entry point, never during unit tests.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runOwnedClient } from "../../../plugins/vh-adlc/scripts/triage/owned-process";
import { syntheticCorpus } from "./fixtures/corpus";
import { git } from "./fixtures";
const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export function inspectComponent(root: string) {
  const files: { mode: number; path: string; sha256: string }[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(join(root, dir)).sort()) {
      const path = dir ? `${dir}/${name}` : name, stat = lstatSync(join(root, path));
      if (stat.isSymbolicLink()) throw Error("component symlink is not an installed payload");
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) files.push({ mode: stat.mode & 0o777, path, sha256: hash(readFileSync(join(root, path))) });
      else throw Error("component contains a special file");
    }
  }
  walk(""); files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const manifests = ["plugin.json", ".claude-plugin/plugin.json"].map(path => JSON.parse(readFileSync(join(root, path), "utf8")));
  if (manifests.some(row => row.name !== "vh-adlc" || row.version !== manifests[0].version)) throw Error("inconsistent component manifests");
  if (!/^0\.(?:[5-9]|[1-9]\d+)\.\d+$/.test(manifests[0].version)) throw Error("maintenance candidate requires version 0.5.0 or later");
  for (const path of ["skills/vh-adlc-maintenance/SKILL.md", "scripts/maintenance/cli.ts", "references/maintenance.md"]) if (!files.some(file => file.path === path)) throw Error("maintenance payload missing");
  return { version: manifests[0].version as string, digest: hash(JSON.stringify(files)), files };
}
export function discoveredClaudeOperations(transcript: string, expected: string[]): string[] {
  const row = transcript.match(/^\s*Skills \((\d+)\)[ \t]+([^\r\n]+)/m), names = row?.[2].split(",").map(name => name.trim());
  if (!row || !names || !expected.length || Number(row[1]) !== expected.length || names.length !== expected.length || new Set(names).size !== names.length || names.some(name => !expected.includes(name))) throw Error("native Claude component inventory missing or differs from installed skills");
  return names;
}
function componentOperations(component: ReturnType<typeof inspectComponent>) {
  return component.files.flatMap(row => row.path.match(/^skills\/([^/]+)\/SKILL\.md$/)?.[1] ?? []);
}
export function verifyCandidateInstall(source: ReturnType<typeof inspectComponent>, installed: ReturnType<typeof inspectComponent>, receipt: any) {
  const failures: string[] = [];
  if (receipt.kind !== "local-catalog") failures.push("candidate provenance differs");
  if (installed.version !== source.version || receipt.version !== source.version || installed.digest !== source.digest || receipt.payload_digest !== source.digest) failures.push("installed payload differs");
  const expected = componentOperations(source);
  if (!Array.isArray(receipt.discovery) || receipt.discovery.length !== expected.length || expected.some(name => !receipt.discovery.includes(name))) failures.push("native component discovery missing or incomplete");
  if (!receipt.commands?.length || receipt.commands.some((row: any) => row.exit_code !== 0 || row.timed_out)) failures.push("native command failed");
  for (const stage of ["settings", "collection", "report"]) {
    const row = receipt.helpers?.find((row: any) => row.stage === stage);
    if (!row || row.exit_code !== 0 || !row.input_before || row.input_before !== row.input_after || !row.index_before || row.index_before !== row.index_after) failures.push(`${stage} helper or preservation failed`);
  }
  return { pass: !failures.length, failures };
}
function json(path: string, value: unknown) { mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + "\n"); }
function locate(root: string): string[] {
  if (!existsSync(root)) return [];
  const result: string[] = [];
  function walk(dir: string) { for (const name of readdirSync(dir)) { const path = join(dir, name); if (lstatSync(path).isDirectory()) walk(path); else if (name === "plugin.json" && !dir.endsWith(".claude-plugin")) { try { if (JSON.parse(readFileSync(path, "utf8")).name === "vh-adlc" && existsSync(join(dir, "skills/vh-adlc-maintenance/SKILL.md"))) result.push(dir); } catch {} } } }
  walk(root); return result;
}
export function sourceSnapshot(root: string) {
  const paths = git(root, "ls-files", "-c", "-o", "--exclude-standard").split("\n").filter(path => path && !path.startsWith(".tools/")).sort();
  return hash(JSON.stringify(paths.map(path => ({ path, mode: lstatSync(join(root, path)).mode & 0o777, sha256: hash(readFileSync(join(root, path))) }))));
}
async function codexSkills(cwd: string, env: Record<string, string>) {
  const child = Bun.spawn(["codex", "app-server"], { cwd, env, stdin: "pipe", stdout: "pipe", stderr: "pipe", detached: true });
  let text = "", errors = "";
  const drainErrors = new Response(child.stderr).text().then(value => { errors = value; });
  const pending = (async () => {
    const reader = child.stdout.getReader(), decoder = new TextDecoder(); let buffer = "";
    child.stdin.write(JSON.stringify({ id: 1, method: "initialize", params: { clientInfo: { name: "maintenance-install-trial", version: "1" } } }) + "\n"); child.stdin.flush();
    while (true) {
      const chunk = await reader.read(); if (chunk.done) throw Error("Codex discovery exited before skills/list");
      buffer += decoder.decode(chunk.value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); if (!line.trim()) continue; text += line + "\n";
        const message = JSON.parse(line);
        if (message.error) throw Error("Codex native discovery returned an error");
        if (message.id === 1) {
          child.stdin.write(JSON.stringify({ method: "initialized", params: {} }) + "\n");
          child.stdin.write(JSON.stringify({ id: 2, method: "skills/list", params: { cwds: [cwd], forceReload: true } }) + "\n"); child.stdin.flush();
        }
        if (message.id === 2) return text;
      }
    }
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Codex discovery timed out")), 30_000); })]); }
  finally {
    clearTimeout(timer); try { process.kill(-child.pid, "SIGKILL"); } catch {} await child.exited; await drainErrors;
    if (errors && !text) writeFileSync(join(cwd, "discovery.stderr"), errors);
  }
}
export function discoveredCodexOperations(transcript: string, pluginID: string): string[] {
  const rows = transcript.trim().split("\n").map(line => JSON.parse(line));
  const result = rows.find(row => row.id === 2)?.result;
  if (!Array.isArray(result?.data) || result.data.some((row: any) => row.errors?.length)) throw Error("native skills/list missing or invalid");
  return result.data.flatMap((row: any) => row.skills ?? []).filter((skill: any) => skill.pluginId === pluginID && skill.enabled === true)
    .map((skill: any) => skill.name.startsWith("vh-adlc:") ? skill.name.slice(8) : skill.name);
}
export async function nativeInstallTrial(repo: string, commit: string, output: string) {
  repo = resolve(repo); output = resolve(output);
  if (existsSync(output)) throw Error("native trial output must be new");
  if (!/^[a-f0-9]{40}$/.test(commit) || git(repo, "rev-parse", commit) !== commit) throw Error("exact source commit required");
  mkdirSync(output, { recursive: true, mode: 0o700 }); chmodSync(output, 0o700);
  const catalog = join(output, "catalog"), neutral = join(output, "neutral"), catalogName = "maintenance-candidate";
  mkdirSync(catalog); mkdirSync(neutral);
  const archive = Bun.spawnSync(["git", "-C", repo, "archive", commit, "plugins/vh-adlc"], { stdout: "pipe", stderr: "pipe" });
  if (archive.exitCode) throw Error("source archive failed");
  const extracted = Bun.spawnSync(["tar", "-x", "-C", catalog], { stdin: archive.stdout, stdout: "pipe", stderr: "pipe" });
  if (extracted.exitCode) throw Error("source extraction failed");
  const component = join(catalog, "plugins/vh-adlc"), source = inspectComponent(component);
  json(join(catalog, ".agents/plugins/marketplace.json"), { name: catalogName, plugins: [{ name: "vh-adlc", source: { source: "local", path: "./plugins/vh-adlc" }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }] });
  json(join(catalog, ".claude-plugin/marketplace.json"), { name: catalogName, owner: { name: "Local acceptance trial" }, plugins: [{ name: "vh-adlc", source: "./plugins/vh-adlc", description: "Frozen maintenance candidate" }] });
  const hosts: any[] = [];
  for (const host of ["codex-cli", "claude-cli"]) {
    const profile = join(output, host), logs = join(profile, "logs"); mkdirSync(logs, { recursive: true, mode: 0o700 });
    const env = { ...process.env, CODEX_HOME: join(profile, "codex"), CLAUDE_CONFIG_DIR: join(profile, "claude") } as Record<string, string>;
    // No credentials/configs are copied. These variables retain their native profile-directory meaning.
    mkdirSync(env.CODEX_HOME, { recursive: true }); mkdirSync(env.CLAUDE_CONFIG_DIR, { recursive: true });
    const commands: any[] = [];
    async function run(argv: string[]) {
      const id = String(commands.length).padStart(2, "0"), stdout = join(logs, `${id}.stdout`), stderr = join(logs, `${id}.stderr`);
      const outcome = await runOwnedClient(argv, { cwd: neutral, env, stdout, stderr }, { timeout_ms: 120_000, grace_ms: 300, reap_ms: 2000 });
      commands.push({ argv, ...outcome, stdout, stderr, stdout_digest: hash(readFileSync(stdout)), stderr_digest: hash(readFileSync(stderr)) });
      json(join(profile, "commands.json"), commands);
      if (outcome.exit_code !== 0 || outcome.timed_out) throw Error(`${host} native command ${id} failed; see owned logs`);
      return readFileSync(stdout, "utf8");
    }
    const client = host === "codex-cli" ? "codex" : "claude";
    const version = (await run([client, "--version"])).trim();
    await run([client, "plugin", "marketplace", "add", catalog, "--json"]);
    await run([client, "plugin", host === "codex-cli" ? "add" : "install", `vh-adlc@${catalogName}`, "--json"]);
    const listed = await run([client, "plugin", "list", "--json"]);
    let discovered = listed;
    if (host === "claude-cli") discovered = await run([client, "plugin", "details", `vh-adlc@${catalogName}`]);
    else {
      discovered = await codexSkills(neutral, env);
      writeFileSync(join(logs, "skills-list.json"), discovered);
    }
    const paths = locate(host === "codex-cli" ? env.CODEX_HOME : env.CLAUDE_CONFIG_DIR);
    const unique = [...new Set(paths)];
    // Native marketplace caches can include both a source tree and an installed cache. Select only installed cache.
    const installedPath = unique.find(path => path.includes("/plugins/cache/"));
    if (!installedPath) throw Error(`${host} installed native cache absent`);
    const installed = inspectComponent(installedPath), helpers: any[] = [], corpus = syntheticCorpus();
    try {
      git(corpus.project.root, "update-ref", "refs/remotes/origin/main", git(corpus.project.root, "rev-parse", "HEAD"));
      const inputBefore = sourceSnapshot(corpus.project.root), indexPath = join(corpus.project.root, ".git/index"), before = hash(readFileSync(indexPath));
      const cli = join(installedPath, "scripts/maintenance/cli.ts");
      async function helper(stage: string, operation: string, args: string[] = []) {
        const stdout = join(logs, `helper-${stage}.json`), stderr = join(logs, `helper-${stage}.stderr`), argv = [process.execPath, cli, operation, "--repo", corpus.project.root, ...args];
        const result = await runOwnedClient(argv, { cwd: neutral, env: { ...env, ...corpus.env }, stdout, stderr }, { timeout_ms: 60_000, grace_ms: 100, reap_ms: 2000 });
        const row = { stage, argv, ...result, input_before: inputBefore, input_after: sourceSnapshot(corpus.project.root), index_before: before, index_after: hash(readFileSync(indexPath)), stdout, stdout_digest: hash(readFileSync(stdout)), stderr };
        if (result.exit_code !== 0) throw Error(`${host} installed ${stage} failed; see logs`);
        helpers.push(row); return JSON.parse(readFileSync(stdout, "utf8"));
      }
      await helper("settings", "settings"); const inventory = await helper("collection", "collect");
      const request = join(output, `${host}-request.json`); json(request, { authorized_sweep: true, read_only: true });
      const started = await helper("start", "start", ["--request", request]);
      const inv = join(output, `${host}-inventory.json`); json(inv, inventory);
      const report = await helper("report", "report", ["--run-id", started.header.run_id, "--inventory", inv, "--default-commit", git(corpus.project.root, "rev-parse", "HEAD")]);
      if (!report.saved || !report.observations || !corpus.requests().every(row => row.argv.includes("GET"))) throw Error("installed report or GET collection missing");
      const receipt = { kind: "local-catalog", host, native_version: version, source_commit: commit, version: installed.version, payload_digest: installed.digest, installed_path: installedPath,
        discovery: host === "codex-cli" ? discoveredCodexOperations(discovered, `vh-adlc@${catalogName}`) : discoveredClaudeOperations(discovered, componentOperations(source)), commands, helpers, authentication_copied: false, model_invocations: 0 };
      // Some Codex plugin/list versions expose only the component. app-server skills/list provides operation discovery separately.
      await run([client, "plugin", host === "codex-cli" ? "remove" : "uninstall", `vh-adlc@${catalogName}`, "--json"]);
      const removed = JSON.parse(await run([client, "plugin", "list", "--json"]));
      const stillInstalled = host === "codex-cli" ? removed.installed?.some((row: any) => row.pluginId === `vh-adlc@${catalogName}` && row.installed) : Array.isArray(removed) ? removed.some((row: any) => row.id === `vh-adlc@${catalogName}`) : true;
      if (stillInstalled) throw Error("native uninstall left candidate installed");
      await run([client, "plugin", host === "codex-cli" ? "add" : "install", `vh-adlc@${catalogName}`, "--json"]);
      if (inspectComponent(installedPath).digest !== source.digest) throw Error("native reinstallation differs");
      Object.assign(receipt, { reinstall: { removed: true, restored_payload_digest: inspectComponent(installedPath).digest } });
      json(join(profile, "receipt.json"), receipt);
      const grade = verifyCandidateInstall(source, installed, receipt); json(join(profile, "grade.json"), grade); hosts.push({ ...receipt, grade });
    } finally { corpus.project.dispose(); }
  }
  const result = { kind: "local-catalog", source_commit: commit, source, hosts, pass: hosts.every(host => host.grade.pass), limitation: "Development candidate proof only; real published-marketplace proof and paired review are required before consumer cutover." };
  json(join(output, "result.json"), result); return result;
}
if (import.meta.main) {
  const [repo, commit, output] = process.argv.slice(2);
  if (!repo || !commit || !output) throw Error("usage: install-trial.ts repository exact-commit new-output-directory");
  const result = await nativeInstallTrial(repo, commit, output); console.log(JSON.stringify({ pass: result.pass, output, hosts: result.hosts.map(row => ({ host: row.host, grade: row.grade })) })); if (!result.pass) process.exitCode = 1;
}
