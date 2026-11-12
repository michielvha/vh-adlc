import { afterEach, expect, test } from "bun:test";
import { fixture, git } from "./fixtures";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/maintenance/settings";
import { appendRun, createRun, type RunScope } from "../../../plugins/vh-adlc/scripts/maintenance/journal";
import { main } from "../../../plugins/vh-adlc/scripts/maintenance/cli";

const projects: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });
const satellite = { repository: "example/satellite", role: "independent" };

function project(settings: Record<string, unknown> = { security_settings: "apply" }, options: { link?: boolean; host?: string } = {}) {
  const f = fixture(); projects.push(f);
  if (options.host) git(f.root, "remote", "set-url", "origin", `https://${options.host}/example/project.git`);
  f.write("AGENTS.md", options.link === false ? "No maintenance settings link here.\n" : "Use [maintenance settings](.vh-adlc/maintenance.yaml).\n");
  f.settings({ schema_version: 1, ...settings });
  git(f.root, "add", "-A"); git(f.root, "commit", "-qm", "docs: maintenance settings");
  const commit = git(f.root, "rev-parse", "HEAD");
  git(f.root, "update-ref", "refs/remotes/origin/main", commit);
  return { ...f, commit };
}
function run(f: ReturnType<typeof project>, request: Record<string, unknown> | null, scope?: RunScope) {
  const config = loadSettings(f.root), created = createRun(config, scope ? { scope } : {});
  if (request) appendRun(config, created.header.run_id, created, { ...created.state, request: request as never });
  return created.header.run_id;
}
function mode(f: ReturnType<typeof project>, options: { repository?: string; runID?: string; commit?: string } = {}) {
  return main(["security-settings-mode", "--repo", f.root, "--repository", options.repository ?? "example/project", "--default-branch", "main",
    "--default-commit", options.commit ?? f.commit, ...(options.runID ? ["--run-id", options.runID] : [])]) as Promise<Record<string, unknown>>;
}

test.each(["read_only", "draft_only", "no_push", "no_filesystem"])("a recorded %s request selects check with request-restricted", async flag => {
  const f = project();
  expect(await mode(f, { runID: run(f, { authorized_sweep: true, [flag]: true }) })).toMatchObject({ repository: "example/project", mode: "check", reason: "request-restricted", detail: flag });
});

test("no_commit alone, no recorded request and committed adoption give apply", async () => {
  const f = project();
  expect(await mode(f, { runID: run(f, { authorized_sweep: true, no_commit: true }) })).toMatchObject({ mode: "apply", reason: "adopted" });
  expect(await mode(f)).toMatchObject({ mode: "apply", reason: "adopted" });
});

test("settings that do not adopt apply give check with not-adopted", async () => {
  expect(await mode(project({}))).toMatchObject({ mode: "check", reason: "not-adopted" });
  expect(await mode(project({ security_settings: "check" }))).toMatchObject({ mode: "check", reason: "not-adopted" });
});

test("an invalid security_settings value fails naming the field, in the working tree or committed", async () => {
  const f = project(); f.settings({ schema_version: 1, security_settings: "maybe" });
  await expect(mode(f)).rejects.toThrow("security_settings");
  const committed = project({ security_settings: "maybe", security_settings_keep_off: [{ repository: "example/project", settings: ["secret_scanning"], reason: "x" }] });
  committed.settings({ schema_version: 1, security_settings_keep_off: [{ repository: "example/project", settings: ["secret_scanning"], reason: "x" }] });
  await expect(mode(committed)).rejects.toThrow("security_settings");
});

test("a repository added only in the working tree gets not-in-committed-scope while the origin applies", async () => {
  const f = project();
  f.settings({ schema_version: 1, security_settings: "apply", repositories: [satellite] });
  expect(await mode(f, { repository: "example/satellite" })).toMatchObject({ mode: "check", reason: "not-in-committed-scope" });
  expect(await mode(f)).toMatchObject({ mode: "apply", reason: "adopted" });
  const named = project({ security_settings: "apply", repositories: [satellite] });
  expect(await mode(named, { repository: "example/satellite" })).toMatchObject({ mode: "apply", reason: "adopted" });
});

test("an unauthorized request and a pull-request scope select check", async () => {
  const f = project();
  expect(await mode(f, { runID: run(f, { authorized_sweep: false }) })).toMatchObject({ mode: "check", reason: "not-authorized-sweep" });
  expect(await mode(f, { runID: run(f, { authorized_sweep: true }, { repositories: ["example/project"], pull: 4 }) })).toMatchObject({ mode: "check", reason: "pull-request-scope" });
  expect(await mode(f, { runID: run(f, null) })).toMatchObject({ mode: "check", reason: "not-authorized-sweep" });
});

test("adoption needs no project_procedure and a committed security_policy does not prevent it", async () => {
  const f = project({ security_settings: "apply" });
  expect(await mode(f)).toMatchObject({ mode: "apply" });
  const fixtureWithPolicy = fixture(); projects.push(fixtureWithPolicy);
  fixtureWithPolicy.write("policy.md", "Consumer rules.\n");
  fixtureWithPolicy.write("AGENTS.md", "Use [maintenance settings](.vh-adlc/maintenance.yaml).\n");
  fixtureWithPolicy.settings({ schema_version: 1, security_settings: "apply", security_policy: "policy.md" });
  git(fixtureWithPolicy.root, "add", "-A"); git(fixtureWithPolicy.root, "commit", "-qm", "docs: policy");
  const commit = git(fixtureWithPolicy.root, "rev-parse", "HEAD"); git(fixtureWithPolicy.root, "update-ref", "refs/remotes/origin/main", commit);
  expect(await mode({ ...fixtureWithPolicy, commit })).toMatchObject({ mode: "apply", reason: "adopted" });
});

test("a default commit that differs from the tracking tip fails naming the cause", async () => {
  const f = project();
  await expect(mode(f, { commit: git(f.root, "rev-parse", "HEAD~1") })).rejects.toThrow("default commit differs");
});

test("adoption only in the working tree, only on an unmerged branch or in an unlinked file gives not-adopted", async () => {
  const tree = project({}); tree.settings({ schema_version: 1, security_settings: "apply" });
  expect(await mode(tree)).toMatchObject({ mode: "check", reason: "not-adopted" });
  const branch = project({});
  git(branch.root, "switch", "-qc", "feature"); branch.settings({ schema_version: 1, security_settings: "apply" });
  git(branch.root, "commit", "-qam", "chore: adopt on a branch");
  expect(await mode(branch)).toMatchObject({ mode: "check", reason: "not-adopted" });
  expect(await mode(project({ security_settings: "apply" }, { link: false }))).toMatchObject({ mode: "check", reason: "not-adopted" });
});

test("a request restriction comes before not-adopted", async () => {
  const f = project({});
  expect(await mode(f, { runID: run(f, { authorized_sweep: true, read_only: true }) })).toMatchObject({ mode: "check", reason: "request-restricted", detail: "read_only" });
});

test("a run scoped to another configured repository gives not-in-run-scope for the origin", async () => {
  const f = project({ security_settings: "apply", repositories: [satellite] });
  expect(await mode(f, { runID: run(f, { authorized_sweep: true }, { repositories: ["example/satellite"] }) })).toMatchObject({ mode: "check", reason: "not-in-run-scope" });
});

test("a host other than github.com gives not-github-com even when the committed settings adopt apply", async () => {
  const f = project({ security_settings: "apply", hostname: "ghe.example.com", repository: "example/project" }, { host: "ghe.example.com" });
  expect(await mode(f)).toMatchObject({ mode: "check", reason: "not-github-com" });
});
