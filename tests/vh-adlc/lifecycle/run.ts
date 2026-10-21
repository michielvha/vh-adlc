// Diagnostic native CLI trials. These do not establish desktop GUI support.
// bun tests/vh-adlc/lifecycle/run.ts --candidate baseline --source-ref <sha>
// bun tests/vh-adlc/lifecycle/run.ts --candidate existing --package <plugin-dir>
// Raw transcripts and isolated account/profile state stay in the temporary run.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildDiagnostic, DOCS_PIN, events, fingerprint, grade, snapshot, type Diagnostic } from "./fixtures";

const REPO = resolve(import.meta.dir, "../../..");
function flag(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  if (at < 0) return;
  const value = process.argv[at + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
  return value;
}
const candidate = flag("--candidate");
if (!candidate || !/^[a-z][a-z0-9-]*$/.test(candidate)) throw new Error("--candidate is required");
const sourceRef = flag("--source-ref"), packageDir = flag("--package");
if (!!sourceRef === !!packageDir) throw new Error("choose --source-ref or --package");
const root = flag("--output") ? resolve(flag("--output")!) : mkdtempSync(join(tmpdir(), `vh-lifecycle-${candidate}-`));
mkdirSync(root, { recursive: true });
const graderHash = fingerprint(import.meta.dir);
cpSync(import.meta.dir, join(root, "driver"), { recursive: true });
const market = join(root, "market");
mkdirSync(market, { recursive: true });
const profile = join(root, "profile");
mkdirSync(profile, { recursive: true });

function run(args: string[], cwd: string, env = process.env) {
  const p = Bun.spawnSync(args, { cwd, env, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`${args[0]} ${args[1]} failed: ${p.stderr.toString()}`);
  return p.stdout.toString();
}
if (sourceRef) {
  const archive = Bun.spawnSync(["git", "archive", sourceRef, "plugins/vh-adlc"], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
  if (archive.exitCode !== 0) throw new Error("cannot archive source ref");
  const unpack = Bun.spawnSync(["tar", "-xf", "-", "-C", market], { stdin: archive.stdout, stdout: "pipe", stderr: "pipe" });
  if (unpack.exitCode !== 0) throw new Error("cannot unpack source ref");
} else {
  cpSync(resolve(packageDir!), join(market, "plugins/vh-adlc"), { recursive: true });
}
mkdirSync(join(market, ".agents/plugins"), { recursive: true });
writeFileSync(join(market, ".agents/plugins/marketplace.json"), JSON.stringify({
  name: "vhco-lifecycle-evaluation",
  plugins: [{ name: "vh-adlc", source: { source: "local", path: "./plugins/vh-adlc" }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }],
}, null, 2));
const auth = join(homedir(), ".codex/auth.json");
if (existsSync(auth)) symlinkSync(auth, join(profile, "auth.json"));
const childEnv = { ...process.env, CODEX_HOME: profile };
const version = run(["codex", "--version"], root).trim();
run(["codex", "plugin", "marketplace", "add", market, "--json"], root, childEnv);
const install = JSON.parse(run(["codex", "plugin", "add", "vh-adlc@vhco-lifecycle-evaluation", "--json"], root, childEnv));
const packageHash = fingerprint(install.installedPath);
const ids = (flag("--cases")?.split(",") ?? ["L01", "L02", "L04", "L05"]) as Diagnostic[];
if (ids.some((id) => !["L01", "L02", "L04", "L05", "L06"].includes(id))) throw new Error("unsupported diagnostic case");
const results: any[] = [];
console.log(JSON.stringify({ candidate, root, version, packageHash, docsPin: DOCS_PIN, surface: "native-cli-diagnostic" }));

for (const id of ids) {
  const trialRoot = join(root, id);
  mkdirSync(trialRoot, { recursive: true });
  const f = buildDiagnostic(trialRoot, id);
  const before = snapshot(f);
  const started = Date.now();
  const rawPath = join(trialRoot, "events.jsonl"), errorPath = join(trialRoot, "stderr.log");
  // --approve-for-me selects workspace-write itself and conflicts with --sandbox.
  // Keep session files inside the disposable profile: independent reviewers may
  // need the parent's persisted rollout. --ephemeral prevented one from starting.
  const args = ["codex", "exec", "--json", "--color", "never", "--approve-for-me", "--cd", f.project, "--add-dir", f.origin, f.prompt];
  const child = Bun.spawn(args, { cwd: f.project, env: childEnv, stdout: Bun.file(rawPath), stderr: Bun.file(errorPath) });
  let timeout = false;
  const timer = setTimeout(() => { timeout = true; child.kill(); }, 240_000);
  const exitCode = await child.exited;
  clearTimeout(timer);
  const raw = readFileSync(rawPath, "utf8");
  const parsed = events(raw);
  const after = snapshot(f);
  const verdict = grade(f, before, after, parsed.response, parsed.commands);
  const unchangedPackage = fingerprint(install.installedPath) === packageHash;
  const result = {
    id, candidate, surface: "native-cli-diagnostic", host: version,
    packageHash, graderHash, docsPin: DOCS_PIN, model: "unknown", configuration: "isolated profile default; retained session in disposable profile; workspace-write; automatic approval review; no model override",
    prompt: f.prompt, durationMs: Date.now() - started, exitCode, timeout,
    status: timeout || exitCode !== 0 || parsed.failed ? "execution-failed" : verdict.pass && unchangedPackage ? "pass" : "fail",
    checks: [...verdict.checks, { name: "installed candidate unchanged", pass: unchangedPackage }],
  };
  writeFileSync(join(trialRoot, "before.json"), JSON.stringify(before, null, 2));
  writeFileSync(join(trialRoot, "after.json"), JSON.stringify(after, null, 2));
  writeFileSync(join(trialRoot, "response.txt"), parsed.response);
  writeFileSync(join(trialRoot, "result.json"), JSON.stringify(result, null, 2));
  results.push(result);
  writeFileSync(join(root, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(result));
  if (result.status === "execution-failed") break;
}
if (results.some((r) => r.status !== "pass")) process.exitCode = 1;
