import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureRepositoryState, captureSnapshot } from "../../../plugins/vh-adlc/scripts/docs-drift/snapshot";
import { runScan } from "../../../plugins/vh-adlc/scripts/docs-drift/scan";
import { commitAll, populateRepository, put } from "./repository-fixture";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fixture(fault = "none", endpoint = "http://127.0.0.1:1") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-drift-scan-")));
  roots.push(root);
  const repo = join(root, "caller");
  const artifacts = join(root, "artifacts");
  mkdirSync(repo);
  mkdirSync(artifacts, { mode: 0o700 });
  const source = readFileSync(join(import.meta.dir, "fixtures/scanner.js"), "utf8")
    .replace("__FIXTURE_CASE__", JSON.stringify(fault)).replace("__FIXTURE_ENDPOINT__", JSON.stringify(endpoint));
  const initialized = populateRepository(repo, false, source);
  return { ...initialized, root, artifacts };
}

async function scan(f: ReturnType<typeof fixture>, timeout_ms = 5000) {
  return await runScan(captureSnapshot(f.repo, f.commit), {
    artifact_root: f.artifacts, owner: "fixture-owner", run: "fixture-run", timeout_ms,
  });
}

test("a complete scan independently accounts for documents, feedback and every detector", async () => {
  const f = fixture();
  put(f.repo, "src/app.ts", "unrelated working change\n");
  put(f.repo, "untracked", "other task\n");
  const before = captureRepositoryState(f.repo);
  const result = await scan(f);
  expect(result.complete).toBe(true);
  expect(result.diagnostics).toEqual([]);
  expect(result.documents).toHaveLength(2);
  expect(result.detectors).toHaveLength(2);
  expect(captureRepositoryState(f.repo)).toEqual(before);
  expect(result.checkout).not.toBe(f.repo);
  expect(result.process?.reaped).toBe(true);
});

test.each([
  "omit-document", "duplicate-document", "wrong-document-digest", "failed-document",
  "omit-unit", "duplicate-unit", "unknown-unit", "failed-unit", "subset-unit", "changed-options",
  "wrong-source", "collection-failure", "mutate-bindings", "no-output", "malformed", "nonzero",
])("incomplete or changed accounting cannot become ready (%s)", async fault => {
  const result = await scan(fixture(fault));
  expect(result.complete).toBe(false);
  expect(result.diagnostics.length).toBeGreaterThan(0);
});

test.each(["mutate-document", "mutate-feedback", "mutate-index", "mutate-ref", "mutate-fetch-head", "mutate-config"])("scanner repository writes remain incomplete and preserve the caller (%s)", async fault => {
  const f = fixture(fault);
  const before = captureRepositoryState(f.repo);
  const result = await scan(f);
  expect(result.complete).toBe(false);
  expect(result.diagnostics.some(item => item.code === "scanner-mutation")).toBe(true);
  expect(captureRepositoryState(f.repo)).toEqual(before);
});

test("unknown local findings and embedded instructions remain visible data", async () => {
  for (const fault of ["finding", "instructions"]) {
    const result = await scan(fixture(fault));
    expect(result.complete).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].detector).toBe("unknown-local-label");
    expect(result.process?.exit_code).toBe(0);
  }
});

test("malformed entries retain valid candidates on both sides of the gap", async () => {
  const result = await scan(fixture("mixed-findings"));
  expect(result.complete).toBe(false);
  expect(result.findings.map(item => item.detector)).toEqual(["valid-before", "valid-after"]);
});

test.each(["oversized-stdout", "oversized-json"])("output bounds apply even if the scanner exits successfully (%s)", async fault => {
  const result = await scan(fixture(fault));
  expect(result.complete).toBe(false);
});

test("zero-input units still emit an explicit complete execution", async () => {
  const f = fixture();
  const settings = JSON.parse(readFileSync(join(f.repo, ".vh-adlc/docs-drift.yaml"), "utf8"));
  settings.detector_inputs.claims = { roots: [], exclusions: [], suffixes: [] };
  put(f.repo, ".vh-adlc/docs-drift.yaml", JSON.stringify(settings));
  f.commit = commitAll(f.repo);
  const result = await scan(f);
  expect(result.complete).toBe(true);
  expect(result.detectors.find(unit => unit.id === "claims")?.input_count).toBe(0);
});

test("scanner environment excludes credentials, agent sockets and ambient Git authentication", async () => {
  const requests: Array<string | null> = [];
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    requests.push(request.headers.get("authorization"));
    return new Response("Authentication required", { status: 401, headers: { "WWW-Authenticate": "Basic realm=fixture" } });
  } });
  const f = fixture("environment", `http://127.0.0.1:${server.port}/fixture.git`);
  const marker = join(f.root, "credential-helper-ran");
  const helper = join(f.root, "credential-helper.sh");
  writeFileSync(helper, `#!/bin/sh\nprintf ran > '${marker}'\nprintf 'username=fixture\\npassword=synthetic-secret\\n'\n`, { mode: 0o700 });
  const global = join(f.root, "gitconfig");
  writeFileSync(global, `[credential]\n\thelper = ${helper}\n[http]\n\textraHeader = Authorization: synthetic-header\n`);
  const canaries = {
    GH_TOKEN: "synthetic-gh", GITHUB_TOKEN: "synthetic-github", COPILOT_GITHUB_TOKEN: "synthetic-copilot",
    ANTHROPIC_API_KEY: "synthetic-provider", AWS_SECRET_ACCESS_KEY: "synthetic-aws", SSH_AUTH_SOCK: "/synthetic-agent",
    GIT_ASKPASS: helper, SSH_ASKPASS: helper, GIT_CONFIG_GLOBAL: global,
  };
  const previous = new Map(Object.keys(canaries).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, canaries);
    const result = await scan(f);
    expect(result.complete).toBe(true);
    const probe = JSON.parse(readFileSync(result.output_path + ".environment.json", "utf8"));
    for (const key of Object.keys(canaries)) {
      if (key === "GIT_CONFIG_GLOBAL") expect(probe.environment[key]).toBe("/dev/null");
      else expect(probe.environment[key]).toBeUndefined();
    }
    expect(probe.helper.trim()).toBe("");
    expect(probe.extraheader.trim()).toBe("");
    expect(probe.push).not.toBe(0);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(value => value === null)).toBe(true);
    expect(existsSync(marker)).toBe(false);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    server.stop(true);
  }
}, 30_000);

test("timeouts and successful parent exits clean their owned descendant group", async () => {
  for (const fault of ["timeout", "child-after-exit"]) {
    const f = fixture(fault);
    const result = await scan(f, fault === "timeout" ? 300 : 5000);
    expect(result.process?.reaped).toBe(true);
    expect(result.complete).toBe(fault === "child-after-exit");
    expect(result.process?.timed_out).toBe(fault === "timeout");
    await Bun.sleep(1400);
    expect(existsSync(result.output_path + ".leaked")).toBe(false);
  }
}, 30_000);

async function waitForRunFile(f: ReturnType<typeof fixture>, name: string): Promise<string> {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    for (const entry of readdirSync(f.artifacts)) {
      if (!entry.startsWith("scan-")) continue;
      const file = join(f.artifacts, entry, name);
      if (existsSync(file)) return file;
    }
    await Bun.sleep(10);
  }
  throw new Error("fixture scanner did not reach its observed checkpoint");
}

test("source changes during collection remain visible and are preserved", async () => {
  const f = fixture("delayed");
  const running = scan(f);
  await waitForRunFile(f, "scan.json.started");
  put(f.repo, "src/app.ts", "new work by another owner\n");
  const result = await running;
  expect(result.complete).toBe(false);
  expect(result.diagnostics.some(item => item.code === "caller-changed")).toBe(true);
  expect(readFileSync(join(f.repo, "src/app.ts"), "utf8")).toBe("new work by another owner\n");
});

test("cancelling the controller cleans its scanner and owned helpers", async () => {
  const f = fixture("timeout");
  const runner = join(f.root, "controller.ts");
  const receipt = join(f.root, "result.json");
  writeFileSync(runner, `
import { captureSnapshot } from ${JSON.stringify(join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/snapshot.ts"))};
import { runScan } from ${JSON.stringify(join(import.meta.dir, "../../../plugins/vh-adlc/scripts/docs-drift/scan.ts"))};
const result = await runScan(captureSnapshot(${JSON.stringify(f.repo)}, ${JSON.stringify(f.commit)}), {
  artifact_root: ${JSON.stringify(f.artifacts)}, owner: "fixture-owner", run: "fixture-run", timeout_ms: 5000,
}, 30_000);
await Bun.write(${JSON.stringify(receipt)}, JSON.stringify(result));
process.exit(result.complete ? 0 : 2);
`);
  const controller = Bun.spawn([process.execPath, runner], { stdout: "ignore", stderr: "pipe", detached: true });
  let scannerPID: number | undefined;
  try {
    await waitForRunFile(f, "scan.json.child-pid");
    const started = await waitForRunFile(f, "process-start.json");
    scannerPID = JSON.parse(readFileSync(started, "utf8")).pid;
    controller.kill("SIGTERM");
    expect(await controller.exited).toBe(2);
    const result = JSON.parse(readFileSync(receipt, "utf8"));
    expect(result.complete).toBe(false);
    expect(result.process.cancelled).toBe("SIGTERM");
    expect(result.process.reaped).toBe(true);
    await Bun.sleep(1400);
    expect(existsSync(result.output_path + ".leaked")).toBe(false);
  } finally {
    if (scannerPID !== undefined) {
      try { process.kill(-scannerPID, "SIGKILL"); } catch { /* The owned group is already gone. */ }
    }
    try { controller.kill("SIGKILL"); } catch { /* The controller is already reaped. */ }
  }
});
