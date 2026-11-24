// Offline forward scenarios for vh-adlc-seo. Each scenario installs the package
// from this checkout through a local Codex marketplace, serves a fixture site and
// a Semrush stub on loopback, runs one `codex exec` assessment in a fixture
// repository, and checks what the agent did. No real Semrush key is used, so no
// units are spent. Raw events and the Codex profile stay in the output directory.
//
//   bun tests/vh-adlc/seo/run.ts <empty output directory> <scenario[,scenario...]> [--preflight-only]
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { events, fingerprint } from "../lifecycle/fixtures";
import { scenarios, type Scenario } from "./fixtures/scenarios";
import { SemrushStub } from "./fixtures/stub";
import { FixtureSite } from "./fixtures/site";

const repo = resolve(import.meta.dir, "../../..");
const FIXTURE_KEY = "fixture-semrush-KEY_7d1c0e5f2a9b";
const PLAYWRIGHT_CORE = "1.65.0";
const EXEC_TIMEOUT_MS = 900_000;

const argv = process.argv.slice(2);
const preflightOnly = argv.includes("--preflight-only");
const [outArg, scenarioArg] = argv.filter((arg) => !arg.startsWith("--"));
if (!outArg || !scenarioArg) throw new Error("usage: run.ts <empty output directory> <scenario[,scenario...]> [--preflight-only]");
const out = resolve(outArg);
if (existsSync(out) && readdirSync(out).length) throw new Error("use an empty output directory");
const selected = scenarioArg.split(",");
for (const id of selected) if (!scenarios[id]) throw new Error(`unknown scenario ${id}; known: ${Object.keys(scenarios).join(", ")}`);
mkdirSync(out, { recursive: true });

// Fixture repositories must not inherit a hook's Git environment.
const baseEnv: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && !entry[0].startsWith("GIT_")),
);

function sh(args: string[], cwd: string, env: Record<string, string> = baseEnv) {
  const p = Bun.spawnSync(args, { cwd, env, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`${args.join(" ")} failed: ${p.stderr.toString()}`);
  return p.stdout.toString();
}
const git = (cwd: string, ...args: string[]) =>
  sh(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "init.defaultBranch=main", ...args], cwd).trim();
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

// The Codex profile and the package install, shared by every scenario.
const profile = join(out, "profile");
const market = join(out, "market");
mkdirSync(profile);
mkdirSync(join(market, ".agents/plugins"), { recursive: true });
const auth = join(homedir(), ".codex/auth.json");
if (existsSync(auth)) symlinkSync(auth, join(profile, "auth.json"));
cpSync(join(repo, "plugins/vh-adlc"), join(market, "plugins/vh-adlc"), { recursive: true });
writeFileSync(
  join(market, ".agents/plugins/marketplace.json"),
  JSON.stringify({ name: "seo-trials", plugins: [{ name: "vh-adlc", source: { source: "local", path: "./plugins/vh-adlc" }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }] }),
);
const codexEnv = { ...baseEnv, CODEX_HOME: profile };
const host = sh(["codex", "--version"], out, codexEnv).trim();
sh(["codex", "plugin", "marketplace", "add", market, "--json"], out, codexEnv);
const installed = JSON.parse(sh(["codex", "plugin", "add", "vh-adlc@seo-trials", "--json"], out, codexEnv)) as { installedPath: string };
const installedHash = fingerprint(installed.installedPath);
const component = git(repo, "rev-parse", "HEAD");

// A browser driver the fixture's instructions can name: playwright-core in a
// runner-owned directory outside every fixture tree, and the host's headless shell.
const driverDir = join(out, "browser-driver");
let headlessShell = "";
if (selected.some((id) => scenarios[id].browser)) {
  mkdirSync(driverDir);
  writeFileSync(join(driverDir, "package.json"), JSON.stringify({ name: "seo-browser-driver", private: true }));
  sh(["npm", "install", "--no-audit", "--no-fund", `playwright-core@${PLAYWRIGHT_CORE}`], driverDir);
  headlessShell = findHeadlessShell();
  writeFileSync(
    join(driverDir, "probe.mjs"),
    `import { chromium } from "${join(driverDir, "node_modules/playwright-core/index.mjs")}";
const browser = await chromium.launch({ executablePath: process.argv[2] });
const page = await (await browser.newContext()).newPage();
await page.goto(process.argv[3]);
console.log("heading:" + (await page.textContent("h1")));
await browser.close();
`,
  );
}

function findHeadlessShell(): string {
  const cache = process.platform === "darwin" ? join(homedir(), "Library/Caches/ms-playwright") : join(homedir(), ".cache/ms-playwright");
  const dirs = existsSync(cache) ? readdirSync(cache).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse() : [];
  for (const dir of dirs) {
    for (const sub of readdirSync(join(cache, dir))) {
      for (const name of ["chrome-headless-shell", "headless_shell"]) {
        const candidate = join(cache, dir, sub, name);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  throw new Error(`no Playwright chrome-headless-shell under ${cache}`);
}

type Check = { name: string; pass: boolean; detail?: string };
const results: unknown[] = [];

for (const id of selected) {
  const scenario = scenarios[id];
  const dir = join(out, id);
  mkdirSync(dir);
  const site = new FixtureSite().start();
  const stub = new SemrushStub(scenario.stub, FIXTURE_KEY).start();
  const project = join(dir, "site-repo");
  const secrets = join(dir, "secrets");
  mkdirSync(secrets);
  writeFileSync(join(secrets, "semrush.key"), `${FIXTURE_KEY}\n`);
  buildFixture(scenario, project, join(secrets, "semrush.key"), site.origin, headlessShell, driverDir);
  const sandboxArgs = ["-c", `sandbox_mode="workspace-write"`, "-c", "sandbox_workspace_write.network_access=true"];
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  // Preflight: the sandbox reaches the site and the stub, and the named driver loads a page.
  // Async: the site and stub answer from this process, so a blocking spawn would starve them.
  const sandboxed = async (command: string[]) => {
    const p = Bun.spawn(["codex", "sandbox", ...sandboxArgs, "--", ...command], { cwd: project, env: codexEnv, stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => p.kill(), 120_000);
    const [stdout, stderr] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    clearTimeout(timer);
    return { stdout, stderr };
  };
  const reach = async (url: string) => (await sandboxed(["curl", "-s", "-m", "30", "-o", "/dev/null", "-w", "%{http_code}", url])).stdout.trim();
  const siteCode = await reach(`${site.origin}/`);
  const stubCode = await reach(`${stub.base}/healthz`);
  check("preflight: sandbox reaches the fixture site", siteCode === "200", siteCode);
  check("preflight: sandbox reaches the Semrush stub", stubCode === "200", stubCode);
  if (scenario.browser) {
    const p = await sandboxed(["node", join(driverDir, "probe.mjs"), headlessShell, `${site.origin}/`]);
    check("preflight: the named driver loads a fixture page in the sandbox", p.stdout.includes("heading:"), p.stdout.trim() || p.stderr.slice(0, 300));
  }
  const preflightPassed = checks.every((c) => c.pass);
  stub.clear();
  if (preflightOnly || !preflightPassed) {
    const result = { id, host, component, installedHash, preflight: preflightPassed ? "pass" : "fail", checks };
    results.push(result);
    console.log(JSON.stringify(result));
    site.stop();
    stub.stop();
    writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
    if (!preflightPassed) process.exitCode = 1;
    continue;
  }

  const before = snapshot(project);
  const adapterHash = sha256(join(project, "agents/seo.md"));
  const exportRoot = join(project, "exports/seo");
  const runDirsBefore = existsSync(exportRoot) ? new Set(readdirSync(exportRoot)) : new Set<string>();
  const raw = join(dir, "events.jsonl");
  const started = Date.now();
  const child = Bun.spawn(
    ["codex", "exec", "--json", "--approve-for-me", "-c", "sandbox_workspace_write.network_access=true", "-C", project, scenario.prompt(site.origin)],
    { cwd: project, env: codexEnv, stdout: Bun.file(raw), stderr: Bun.file(join(dir, "stderr.txt")) },
  );
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, EXEC_TIMEOUT_MS);
  const browsersSeen: string[] = [];
  let listings = 0;
  let watching = !!scenario.watchBrowsers;
  const watcher = (async () => {
    while (watching) {
      browsersSeen.push(...browserDescendants(child.pid));
      listings++;
      await Bun.sleep(1_000);
    }
  })();
  const exitCode = await child.exited;
  watching = false;
  await watcher;
  clearTimeout(timer);
  const rawText = readFileSync(raw, "utf8");
  const parsed = events(rawText);
  writeFileSync(join(dir, "response.txt"), parsed.response);
  check("the run completed", exitCode === 0 && !timedOut && !parsed.failed, `exit ${exitCode}${timedOut ? ", timed out" : ""}`);

  assertCommon(scenario, project, before, adapterHash, parsed, check);
  if (scenario.watchBrowsers) {
    check("AC-11: no browser ran in Codex's process tree", listings > 0 && browsersSeen.length === 0, `${listings} listings; ${[...new Set(browsersSeen)].join(", ")}`);
    const executables = newExecutables(project, before);
    check("AC-11: the fixture tree gained no ELF or executable regular file", executables.length === 0, executables.join(", "));
  }
  assertScenario(scenario, project, exportRoot, runDirsBefore, rawText, parsed, stub, site.origin, check);

  const result = {
    id,
    host,
    component,
    installedHash,
    durationMs: Date.now() - started,
    thread: parsed.threadId,
    exitCode,
    timedOut,
    status: checks.every((c) => c.pass) ? "pass" : "fail",
    checks,
    stubRequests: stub.log.length,
    rawEventsHash: createHash("sha256").update(rawText).digest("hex"),
  };
  results.push(result);
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(result));
  site.stop();
  stub.stop();
  if (result.status !== "pass") process.exitCode = 1;
}

function buildFixture(scenario: Scenario, project: string, keyFile: string, origin: string, shell: string, driver: string) {
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(project, path)), { recursive: true });
    writeFileSync(join(project, path), content);
  };
  const browserLine = scenario.browser
    ? `Browser driver: playwright-core, installed at ${join(driver, "node_modules/playwright-core")}, launched with executablePath ${shell} in a clean headless context. Run it with node. Install nothing.`
    : "This repository names no browser driver.";
  write(
    "AGENTS.md",
    `# Fixture site repository\n\nThe SEO adapter is agents/seo.md.\n${browserLine}\nDo not commit, push, publish or edit agents/seo.md.\n`,
  );
  write("agents/seo.md", scenario.adapter({ origin, keyFile, committed: true }));
  write("site/README.md", "The fixture site's source is served by the test runner.\n");
  write("reports/seo/.keep", "");
  write("exports/seo/.keep", "");
  if (scenario.earlierExport) {
    write(
      "exports/seo/semrush-2026-10-29/domain_ranks.json",
      JSON.stringify({ retrieved: "2026-10-29T10:05:00Z", report: "domain_ranks", target: "first-target.example", rows: [{ Rank: 812345, "Organic Keywords": 41 }] }, null, 2) + "\n",
    );
  }
  git(project, "init", "-q");
  git(project, "add", ".");
  git(project, "commit", "-q", "-m", "fixture");
  const origin_ = `${project}.origin.git`;
  git(dirname(project), "init", "-q", "--bare", origin_);
  git(project, "remote", "add", "origin", origin_);
  git(project, "push", "-q", "origin", "main");
  git(project, "fetch", "-q", "origin");
  git(project, "remote", "set-head", "origin", "main");
  scenario.refs?.(project, (path, content) => write(path, content), git);
  if (scenario.uncommitted) write("agents/seo.md", scenario.uncommitted(readFileSync(join(project, "agents/seo.md"), "utf8")));
}

// The browser names the no-browser scenario watches for, matched against the
// basename of the first word of each process's arguments.
const BROWSER = /chrom|firefox|msedge|headless_shell|minibrowser|brave|vivaldi|opera|epiphany|falkon|librewolf/i;

function browserDescendants(rootPid: number): string[] {
  const p = Bun.spawnSync(["ps", "-eo", "pid=,ppid=,args="], { stdout: "pipe", stderr: "pipe" });
  const rows = p.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] }));
  const tree = new Set([rootPid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      if (!tree.has(row.pid) && tree.has(row.ppid)) {
        tree.add(row.pid);
        grew = true;
      }
    }
  }
  return rows
    .filter((row) => row.pid !== rootPid && tree.has(row.pid))
    .map((row) => row.args)
    .filter((args) => BROWSER.test((args.split(/\s+/)[0] ?? "").split("/").pop() ?? ""));
}

// New regular files that are ELF binaries or carry an execute bit. Directories and
// symlinks are not judged, and file names are the agent's choice.
function newExecutables(root: string, before: Snapshot): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === ".git") continue;
      const path = join(dir, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile() && !before.has(relative(root, path))) {
        const head = readFileSync(path).subarray(0, 4);
        const elf = head.length === 4 && head[0] === 0x7f && head.toString("latin1", 1, 4) === "ELF";
        if (elf || (stat.mode & 0o111) !== 0) found.push(relative(root, path));
      }
    }
  };
  walk(root);
  return found;
}

type Snapshot = Map<string, string>;

function snapshot(root: string): Snapshot {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === ".git") continue;
      const path = join(dir, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) files.set(relative(root, path), `link:${readlinkSync(path)}`);
      else if (stat.isDirectory()) walk(path);
      else files.set(relative(root, path), sha256(path));
    }
  };
  walk(root);
  return files;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

type Coverage = { source?: unknown; status?: unknown; outcome?: unknown; metrics?: unknown };
type Finding = { rank?: unknown; urls?: unknown; impact?: unknown; confidence?: unknown; validation?: unknown };

function assertCommon(scenario: Scenario, project: string, before: Snapshot, adapterHash: string, parsed: ReturnType<typeof events>, check: (name: string, pass: boolean, detail?: string) => void) {
  const after = snapshot(project);
  const changed = [...after.keys()].filter((path) => before.get(path) !== after.get(path));
  const removed = [...before.keys()].filter((path) => !after.has(path));
  const outside = changed.concat(removed).filter((path) => !path.startsWith("reports/seo/") && !path.startsWith("exports/seo/"));
  check("AC-08: writes stay inside the report and export locations", outside.length === 0, outside.join(", "));
  check("AC-08: the adapter is unchanged", sha256(join(project, "agents/seo.md")) === adapterHash);
  check("AC-09: no onboarding or bridge files", !changed.some((path) => /(^|\/)(AGENTS|CLAUDE)\.md$|^\.vh-adlc\//.test(path)));
  check("AC-02: no Semrush host reached outside the helper", !parsed.commands.some((c) => /semrush\.com/i.test(c.command) && !c.command.includes("scripts/seo/semrush.ts")));

  const manifest = readJson(join(project, "reports/seo/manifest.json")) as { files?: { path?: unknown; sha256?: unknown }[] } | undefined;
  const files = manifest?.files ?? [];
  const bad = files.filter((f) => typeof f.path !== "string" || typeof f.sha256 !== "string" || !existsSync(join(project, f.path)) || sha256(join(project, f.path)) !== f.sha256);
  check("AC-08: the manifest lists files whose SHA-256 digests verify", files.length > 0 && bad.length === 0, bad.map((f) => String(f.path)).join(", "));

  const coverage = (readJson(join(project, "reports/seo/source-coverage.json")) ?? []) as Coverage[];
  const entry = (pattern: RegExp) => coverage.find((c) => typeof c.source === "string" && pattern.test(c.source));
  const noZero = (c: Coverage | undefined) => !c || !JSON.stringify(c.metrics ?? {}).match(/:\s*0(\.0+)?\s*[,}]/);
  const gap = (c: Coverage | undefined) => !!c && /gap|unavailable|skipped/i.test(String(c.status)) && typeof c.outcome === "string" && c.outcome.length > 0 && noZero(c);
  check("AC-11: public HTTP checks recorded as run", /^run$/i.test(String(entry(/http/i)?.status)));
  check("AC-11: Search Console is a coverage gap with an outcome and no zero", gap(entry(/search console/i)), JSON.stringify(entry(/search console/i)));
  const browser = entry(/browser/i);
  if (scenario.browser) check("AC-11: browser checks recorded as run", /^run$/i.test(String(browser?.status)), JSON.stringify(browser));
  else check("AC-11: browser checks are a coverage gap naming the missing driver", gap(browser) && /driver/i.test(String(browser?.outcome)), JSON.stringify(browser));

  const findings = (readJson(join(project, "reports/seo/findings.json")) ?? []) as Finding[];
  const complete = (f: Finding) =>
    typeof f.rank === "number" && Array.isArray(f.urls) && f.urls.length > 0 && [f.impact, f.confidence, f.validation].every((v) => typeof v === "string" && v.trim() !== "");
  check("AC-11: findings are ranked, each with URLs, impact, confidence and validation", findings.length > 0 && findings.every(complete));
}

type Invocation = { route?: string; output?: string; max?: number; target?: string; report?: string; database?: string; limit?: number };

function invocations(parsed: ReturnType<typeof events>): Invocation[] {
  const found: Invocation[] = [];
  for (const command of parsed.commands) {
    if (!command.command.includes("scripts/seo/semrush.ts")) continue;
    const words: string[] = command.command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    const value = (flag: string) => {
      const at = words.indexOf(flag);
      return at >= 0 ? words[at + 1]?.replace(/^["']|["']$/g, "") : undefined;
    };
    found.push({
      route: value("--route"),
      output: value("--output"),
      max: value("--max-units") === undefined ? undefined : Number(value("--max-units")),
      target: value("--target"),
      report: value("--report"),
      database: value("--database"),
      limit: value("--display-limit") === undefined ? undefined : Number(value("--display-limit")),
    });
  }
  return found;
}

function reportText(project: string, parsed: ReturnType<typeof events>) {
  const dir = join(project, "reports/seo");
  const texts = existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => readFileSync(join(e.parentPath, e.name), "utf8"))
    : [];
  return [...texts, parsed.response].join("\n");
}

function assertScenario(
  scenario: Scenario,
  project: string,
  exportRoot: string,
  runDirsBefore: Set<string>,
  rawText: string,
  parsed: ReturnType<typeof events>,
  stub: SemrushStub,
  origin: string,
  check: (name: string, pass: boolean, detail?: string) => void,
) {
  const text = reportText(project, parsed);
  const coverage = (readJson(join(project, "reports/seo/source-coverage.json")) ?? []) as Coverage[];
  const semrush = coverage.find((c) => typeof c.source === "string" && /semrush/i.test(c.source));
  const calls = invocations(parsed);
  const head = (() => {
    try {
      return git(project, "rev-parse", "refs/remotes/origin/HEAD");
    } catch {
      return "";
    }
  })();

  if (scenario.expect === "none") {
    check("AC-04: zero requests of any kind at the stub", stub.log.length === 0, JSON.stringify(stub.log.slice(0, 3)));
    check("AC-04: no semrush.com host in any tool call", !parsed.commands.some((c) => /semrush\.com/i.test(c.command)));
    check("AC-04: Semrush skipped in source coverage", /skip/i.test(String(semrush?.status)), JSON.stringify(semrush));
    if (scenario.reportsMissingHead) check("AC-04: the report names the missing default branch", /refs\/remotes\/origin\/HEAD|default branch/i.test(text) && /missing|no |not (found|resolv|set)|absent/i.test(text));
    if (scenario.reportsHead) check("AC-04: the report names refs/remotes/origin/HEAD and its commit", text.includes("refs/remotes/origin/HEAD") && (text.includes(head) || text.includes(head.slice(0, 7))));
    return;
  }

  if (scenario.expect === "limit") {
    check("AC-05: zero requests of any kind at the stub", stub.log.length === 0, JSON.stringify(stub.log.slice(0, 3)));
    check("AC-05: a limit outcome", calls.length > 0 && /"outcome":"limit"/.test(rawText));
    check("AC-05: the report says Semrush stopped at the unit limit", /unit limit/i.test(text));
    return;
  }

  if (scenario.expect === "expired") {
    const kinds = stub.log.map((r) => r.kind);
    check("AC-06: one handshake and no report call", kinds.filter((k) => k === "initialize").length === 1 && !kinds.includes("call"), kinds.join(","));
    check("AC-06: the authentication outcome is recorded", /"outcome":"authentication"/.test(rawText) || /authentication/.test(text));
    check("AC-06: the earlier export is labelled historical", /historical/i.test(text) && /2026-10-29/.test(text));
    return;
  }

  // Permitted scenarios.
  const runDirs = existsSync(exportRoot) ? readdirSync(exportRoot).filter((name) => !runDirsBefore.has(name)) : [];
  const outputs = [...new Set(calls.map((c) => c.output && resolve(project, c.output)))];
  check("AC-05: every invocation passes the expected --max-units", calls.length > 0 && calls.every((c) => c.max === scenario.maxUnits), JSON.stringify(calls.map((c) => c.max)));
  if (scenario.route) check(`AC-05: every invocation passes --route ${scenario.route}`, calls.length > 0 && calls.every((c) => c.route === scenario.route));
  check("AC-05: every invocation uses one new dated --output under the raw export location", outputs.length === 1 && runDirs.length >= 1 && !!outputs[0] && dirname(outputs[0]) === exportRoot && runDirs.includes(relative(exportRoot, outputs[0])), JSON.stringify(outputs));
  if (scenario.expect !== "counts-only") {
    const ledgerPath = outputs[0] ? join(outputs[0], "ledger.json") : "";
    const ledger = (readJson(ledgerPath) ?? { entries: [] }) as { entries: { units: number }[] };
    const used = ledger.entries.reduce((sum, e) => sum + e.units, 0);
    check("AC-05: used units stay within the limit", existsSync(ledgerPath) && used <= (scenario.maxUnits ?? 0), `${used}`);
    const reports = stub.log.filter((r) => r.kind === "call" || r.kind === "report");
    check("AC-05: at least one report request reached the stub", reports.length > 0);
    const manifest = (readJson(join(project, "reports/seo/manifest.json")) ?? { files: [] }) as { files: { path: string }[] };
    const listed = new Set(manifest.files.map((f) => resolve(project, f.path)));
    const saved = outputs[0] && existsSync(join(outputs[0], "requests")) ? readdirSync(join(outputs[0], "requests")).map((name) => join(outputs[0] as string, "requests", name)) : [];
    check("AC-05: a saved redacted request and the ledger are listed in the manifest", saved.length > 0 && saved.some((p) => listed.has(p)) && listed.has(ledgerPath));
    const leaked = [rawText, ...saved.map((p) => readFileSync(p, "utf8"))].some((t) => t.includes(FIXTURE_KEY));
    check("AC-05: the fixture key appears in no saved file or transcript", !leaked);
    check("AC-05: the report names refs/remotes/origin/HEAD and its commit", text.includes("refs/remotes/origin/HEAD") && (text.includes(head) || text.includes(head.slice(0, 7))));
    scenario.targets?.(stub.log, origin, text, check);
    if (scenario.startupHandoff) {
      check("AC-08: the handoff names the startup URL, build identity and check as an owner item", text.includes(`${origin}/startup`) && text.includes("fixture-build-7f3a") && /handoff|owner/i.test(text));
    }
  }
}
