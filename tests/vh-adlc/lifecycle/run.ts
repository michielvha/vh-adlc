// Diagnostic native CLI trials. These do not establish desktop GUI support.
// bun tests/vh-adlc/lifecycle/run.ts --candidate baseline --source-ref <sha>
// bun tests/vh-adlc/lifecycle/run.ts --candidate existing --package <plugin-dir>
// Raw transcripts and isolated account/profile state stay in the temporary run.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildDiagnostic, DOCS_PIN, events, fingerprint, grade, isMaintenance, maintenancePaths, snapshot } from "./fixtures";
import { verifyFeatureReview, verifyMaintenanceReview } from "./native-review";
import { scenarioPlan } from "./scenario-plan";
import { needsMaintenanceReview } from "./maintenance-fixture";

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
const plan = scenarioPlan({ cases: flag("--cases"), reserved: flag("--reserved"), repeat: flag("--repeat") });
const allowed = new Set(["--candidate", "--source-ref", "--package", "--output", "--cases", "--reserved", "--repeat"]);
for (let i = 2; i < process.argv.length; i += 2) if (!allowed.has(process.argv[i]) || !process.argv[i + 1]) throw new Error(`unknown or incomplete argument: ${process.argv[i]}`);
const root = flag("--output") ? resolve(flag("--output")!) : mkdtempSync(join(tmpdir(), `vh-lifecycle-${candidate}-`));
if (existsSync(root) && readdirSync(root).length) throw new Error("output directory must be empty; saved trial evidence cannot be overwritten");
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
const results: any[] = [];
console.log(JSON.stringify({ candidate, root, version, packageHash, docsPin: DOCS_PIN, surface: "native-cli-diagnostic" }));

for (const { id, trial, variant, prompt, prompts, seedReadOnlyWorkflow } of plan) {
  const trialRoot = join(root, trial);
  mkdirSync(trialRoot, { recursive: true });
  const f = buildDiagnostic(trialRoot, id, { seedReadOnlyWorkflow });
  if (prompt || prompts) f.prompt = prompt ?? prompts![0];
  const before = snapshot(f);
  const started = Date.now();
  // --approve-for-me selects workspace-write itself and conflicts with --sandbox.
  // Keep session files inside the disposable profile: independent reviewers may
  // need the parent's persisted rollout. --ephemeral prevented one from starting.
  let timeout = false, exitCode = 0, raw = "", parentThread = "";
  const phases: any[] = [], phaseChecks: any[] = [];
  for (const [at, text] of (prompts ?? [f.prompt]).entries()) {
    const rawPath = join(trialRoot, prompts ? `phase-${at + 1}.events.jsonl` : "events.jsonl");
    const errorPath = join(trialRoot, prompts ? `phase-${at + 1}.stderr.log` : "stderr.log");
    const args = ["codex", "exec", "--json", "--color", "never", "--approve-for-me", "--cd", f.project, "--add-dir", f.origin];
    if (id === "L13") args.push("--skip-git-repo-check");
    if (id === "L17-missing") args.push("--disable", "multi_agent");
    args.push(...(at === 0 ? [text] : ["resume", parentThread, text]));
    const child = Bun.spawn(args, { cwd: f.project, env: childEnv, stdout: Bun.file(rawPath), stderr: Bun.file(errorPath) });
    const timer = setTimeout(() => { timeout = true; child.kill(); }, id === "L15" ? 720_000 : 240_000);
    exitCode = await child.exited;
    clearTimeout(timer);
    const phaseRaw = readFileSync(rawPath, "utf8"), phase = events(phaseRaw);
    raw += phaseRaw + "\n";
    phases.push({ prompt: text, exitCode, timeout, thread: phase.threadId });
    if (timeout || exitCode !== 0 || phase.failed) break;
    if (at === 0) parentThread = phase.threadId;
    else phaseChecks.push({ name: `phase ${at + 1} resumes the same native thread`, pass: phase.threadId === parentThread });
    if (prompts && at === 0) {
      const checkpoint = snapshot(f);
      writeFileSync(join(trialRoot, "phase-1.snapshot.json"), JSON.stringify(checkpoint, null, 2));
      mkdirSync(join(trialRoot, "phase-1-artifact"));
      cpSync(join(f.project, "README.md"), join(trialRoot, "phase-1-artifact/README.md"));
      const first = grade({ ...f, id: "L02" }, before, checkpoint, phase.response, phase.commands);
      phaseChecks.push(...first.checks.map((c) => ({ ...c, name: `phase 1: ${c.name}` })));
      if (!first.pass || !parentThread) break;
    }
  }
  if (prompts) writeFileSync(join(trialRoot, "events.jsonl"), raw);
  const parsed = events(raw);
  const after = snapshot(f);
  const review = ["L15", "L10"].includes(id) ? verifyFeatureReview(f.project, join(profile, "sessions"), parsed.threadId)
    : isMaintenance(id) || needsMaintenanceReview(id) ? verifyMaintenanceReview(f.project, join(profile, "sessions"), parsed.threadId, maintenancePaths(id)) : undefined;
  const verdict = grade(f, before, after, parsed.response, parsed.commands, review);
  if (prompts) {
    phaseChecks.push({ name: "all requested scope-change turns completed", pass: phases.length === prompts.length });
    phaseChecks.push(grade({ ...f, id: "L02" }, before, after, parsed.response, parsed.commands).checks.find((c) => c.name === "README actually corrected"));
  }
  const unchangedPackage = fingerprint(install.installedPath) === packageHash;
  const result = {
    id, trial, variant, candidate, surface: "native-cli-diagnostic", host: version,
    packageHash, graderHash, docsPin: DOCS_PIN, model: "unknown", configuration: "isolated profile default; retained session in disposable profile; workspace-write; automatic approval review; no model override",
    prompt: f.prompt, durationMs: Date.now() - started, exitCode, timeout,
    review, phases: prompts ? phases : undefined,
    hostConstraint: id === "L17-missing" ? "native multi_agent disabled for this trial; launching a replacement host is outside its request" : undefined,
    status: timeout || exitCode !== 0 || parsed.failed ? "execution-failed" : verdict.pass && phaseChecks.every((c) => c?.pass) && unchangedPackage ? "pass" : "fail",
    checks: [...phaseChecks, ...verdict.checks, { name: "installed candidate unchanged", pass: unchangedPackage }],
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
