import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { aws, incomplete, oci } from "./fixtures";
import { runOwnedClient } from "../../../plugins/vh-adlc/scripts/triage/owned-process";

const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const repo = resolve(import.meta.dir, "../../..");
const { values } = parseArgs({ options: { host: { type: "string" }, case: { type: "string" } } });
if (values.host !== "codex" && values.host !== "claude") throw Error("Use --host codex or --host claude");
if (values.case !== "fixtures" && values.case !== "intake") throw Error("Use --case fixtures or --case intake");
const host = values.host;
const output = process.env.VH_DIAGRAM_TRIAL_OUTPUT ?? mkdtempSync(join(tmpdir(), "vh-diagram-native-"));
mkdirSync(output, { recursive: true, mode: 0o700 });
if (readdirSync(output).length) throw Error("Use an empty native-trial output directory");
console.log(output);
const catalog = join(output, "catalog");
const profile = join(output, "profile");
const neutral = join(output, "neutral");
mkdirSync(profile);
mkdirSync(neutral);
const env = { ...process.env, [host === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR"]: profile };
const auth = host === "codex" ? "auth.json" : ".credentials.json";
const userAuth = join(homedir(), host === "codex" ? ".codex" : ".claude", auth);
const profileAuth = join(profile, auth);
const expected = {
  VH_DIAGRAM_SCHEMA: "905db85d4e8ebec0e91518cdd62982e0afb3f09ebdcaf9e6b1952957a606639a",
  VH_DIAGRAM_AWS: "fba0e5bccf2cf9f186cd7a0a4bbb29b6bcc4f57878306bf31c2d1f6113b8c1bd",
  VH_DIAGRAM_OCI: "e098244928cdd5257c1bc4696cf9f46fd289b4195208d699e5392bf79de69555",
};
const renderer = process.env.VH_DIAGRAM_DRAWIO;
if (!renderer) throw Error("Set VH_DIAGRAM_DRAWIO to the local draw.io 32.6.10 executable or offline display wrapper");
for (const [key, digest] of Object.entries(expected)) {
  const path = process.env[key];
  if (!path || hash(path) !== digest) throw Error("Missing or mismatched fixture input: " + key);
}
function command(args: string[], cwd = neutral) {
  const result = Bun.spawnSync(args, { cwd, env, stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  if (result.exitCode) throw Error(args.slice(0, 3).join(" ") + " failed: " + result.stderr.toString().slice(0, 800));
  return result.stdout.toString().trim();
}
function packageSnapshot(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(path: string) {
    for (const entry of readdirSync(join(dir, path), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = join(path, entry.name);
      if (entry.isDirectory()) visit(relative);
      else if (entry.isFile()) result[relative] = hash(join(dir, relative));
      else throw Error("Unexpected non-regular plugin file");
    }
  }
  visit("");
  return result;
}
function installedPackage(dir: string): string | undefined {
  if (!existsSync(dir)) return;
  if (existsSync(join(dir, "plugin.json")) && existsSync(join(dir, "skills"))) return dir;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const hit = installedPackage(join(dir, entry.name));
      if (hit) return hit;
    }
  }
}
function observedRead(raw: string, skill: string) {
  const requested = new Set<string>();
  for (const line of raw.split("\n").filter(Boolean)) {
    const event = JSON.parse(line);
    if (host === "codex" && event.type === "item.completed" && event.item?.type === "command_execution"
      && event.item.exit_code === 0 && event.item.command?.includes(skill)
      && event.item.aggregated_output?.includes("name: vh-adlc-diagram")) return true;
    if (host !== "claude") continue;
    for (const item of event.message?.content ?? []) {
      if (item.type === "tool_use" && (
        (item.name === "Read" && item.input?.file_path === skill) ||
        (item.name === "Bash" && item.input?.command?.includes(skill)) ||
        (item.name === "Skill" && item.input?.skill === "vh-adlc:vh-adlc-diagram")
      )) requested.add(item.id);
      if (item.type === "tool_result" && !item.is_error && requested.has(item.tool_use_id)
        && JSON.stringify(item.content).includes("name: vh-adlc-diagram")) return true;
    }
  }
  return false;
}

try {
  const candidate = join(repo, "plugins/vh-adlc");
  if (!existsSync(join(candidate, "skills/vh-adlc-diagram/SKILL.md"))) throw Error("candidate has no installed diagram skill source");
  if (command(["git", "status", "--porcelain", "--", "plugins/vh-adlc", "tests/vh-adlc/diagram", ".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"], repo)) throw Error("Commit the candidate and fixture runner before native proof");
  const commit = command(["git", "rev-parse", "HEAD"], repo);
  const hostVersion = command([host, "--version"]);
  const drawioVersion = command([renderer, "--version"]);
  if (!/^32\.6\.10$/.test(drawioVersion)) throw Error("Expected draw.io Desktop 32.6.10");
  const catalogPath = host === "codex" ? ".agents/plugins/marketplace.json" : ".claude-plugin/marketplace.json";
  mkdirSync(catalog);
  cpSync(join(repo, catalogPath.split("/").slice(0, -1).join("/")), join(catalog, catalogPath.split("/").slice(0, -1).join("/")), { recursive: true });
  cpSync(join(repo, "plugins"), join(catalog, "plugins"), { recursive: true });
  if (existsSync(userAuth)) symlinkSync(userAuth, profileAuth);
  command([host, "plugin", "marketplace", "add", catalog, "--json"]);
  command([host, "plugin", host === "codex" ? "add" : "install", "vh-adlc@vhco-tools", "--json"]);
  const installed = installedPackage(join(profile, "plugins/cache/vhco-tools/vh-adlc"));
  if (!installed || JSON.stringify(packageSnapshot(installed)) !== JSON.stringify(packageSnapshot(candidate))) throw Error("Installed plugin differs from candidate");
  const skill = join(installed, "skills/vh-adlc-diagram/SKILL.md");
  const cases = values.case === "fixtures" ? [aws, oci] : [aws, oci, incomplete];
  const results = [];
  for (const fixture of cases) {
    const run = join(output, fixture.name);
    const project = join(run, "project");
    mkdirSync(project, { recursive: true });
    const input = join(project, "sources.md");
    const destination = join(project, "diagram");
    writeFileSync(input, fixture.source);
    const prompt = `Use the installed vh-adlc-diagram skill. Read the installed skill at ${skill} with a native read or cat so this trial records its use. ${fixture.question}
Read the supplied repository evidence or written design in ${input}. Put final files in ${destination} if the evidence supports a useful view. Put working files in ${project}. Render using the installed helper and configured local tools below. Draw a polished landscape diagram with grouping, readable connector labels and source-backed content. Use source labels for semantic items and cite sources.md line numbers in the brief.
Draw.io local executable: ${renderer}
XML schema: ${process.env.VH_DIAGRAM_SCHEMA} SHA-256 ${expected.VH_DIAGRAM_SCHEMA}
AWS shape index: ${process.env.VH_DIAGRAM_AWS} SHA-256 ${expected.VH_DIAGRAM_AWS}
OCI library: ${process.env.VH_DIAGRAM_OCI} SHA-256 ${expected.VH_DIAGRAM_OCI}
This is a synthetic fixture. Do not change sources.md, the installed package, Git, host configuration, or use a hosted renderer. Report files or ask the necessary clarification.`;
    writeFileSync(join(run, "prompt.txt"), prompt);
    const argv = host === "codex"
      ? ["codex", "exec", "--json", "--ephemeral", "--skip-git-repo-check", "--sandbox", "workspace-write", "-c", "sandbox_workspace_write.network_access=false", "-C", project, prompt]
      : ["claude", "-p", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--permission-mode", "acceptEdits", "--allowedTools", "Read,Write,Edit,Glob,Grep,Skill,Bash", "--", prompt];
    const transcript = join(run, "transcript.jsonl");
    const outcome = await runOwnedClient(argv, { cwd: project, env, stdout: transcript, stderr: join(run, "host.stderr") }, { timeout_ms: 720_000, grace_ms: 500, reap_ms: 2000 });
    const raw = readFileSync(transcript, "utf8");
    const result = { fixture: fixture.name, activated: observedRead(raw, skill), outcome, output: existsSync(destination) ? packageSnapshot(destination) : null };
    results.push(result);
    writeFileSync(join(output, "manifest.json"), JSON.stringify({ commit, host, hostVersion, drawioVersion, inputs: expected, skill: hash(skill), results }, null, 2) + "\n");
    console.log(JSON.stringify(result));
  }
  if (results.some(r => r.outcome.exit_code !== 0 || !r.activated || (r.fixture === incomplete.name ? Boolean(r.output) : !r.output))) process.exitCode = 1;
} finally {
  rmSync(profileAuth, { force: true });
}
