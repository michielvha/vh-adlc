import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inspectAuthority, inspectCandidatePolicy } from "../../../plugins/vh-adlc/scripts/audit/authority";
import { loadSettings } from "../../../plugins/vh-adlc/scripts/audit/settings";
import { fixture, git } from "./fixtures";

const fields = {
  repository: "example/project", hostname: "github.com", default_branch: "main", ledger_path: "docs/audit.md",
  status_effects: "none", reverify_effects: "ledger-update,ledger-commit", full_effects: "ledger-update,ledger-commit",
  fix_effects: "source-edit,ledger-update,local-commit,live-verify,issue-write,branch-push,pr-write,conditional-merge",
  selection_policy: "#selection", verification_policy: "#verification", merge_policy: "#merge",
};
export function policy(values: Record<string, string> = fields) {
  return ["# Project audit", "", "## Standing audit workflow authorization", "", "| Field | Value |", "| --- | --- |",
    ...Object.entries(values).map(([key, value]) => `| ${key} | ${value} |`), "", "## Selection", "Explicit IDs and workstream only.",
    "", "## Verification", "Required checks and scoped development verification.", "", "## Merge", "Current clean review and all required gates; no product decisions.", ""].join("\n");
}
const projects: ReturnType<typeof fixture>[] = [];
function adopted(values = fields) {
  const f = fixture(); projects.push(f);
  f.write("AGENTS.md", "# Local rules\n\nAudit: [settings](.vh-adlc/audit.json), [policy](audit-project.md).\n");
  f.write("audit-project.md", policy(values)); const commit = f.commit("test: adopted audit policy");
  git(f.root, "update-ref", "refs/remotes/origin/main", commit);
  let fetches = 0;
  const refresh = () => { fetches++; return { default_branch: "main", default_commit: git(f.root, "rev-parse", "refs/remotes/origin/main") }; };
  const request = { authorized: true, mode: "fix" as const, ids: ["AUD-001"], workstream: "A", eligible_repair: true };
  return { f, config: loadSettings(f.root), refresh, request, fetches: () => fetches };
}
afterEach(() => { for (const f of projects.splice(0)) f.dispose(); });

test("an adopted exact committed declaration permits only the current selected mode/effect and records its provenance", () => {
  const c = adopted();
  const result = inspectAuthority(c.config, { mode: "fix", ids: ["AUD-001"], workstream: "A", effect: "branch-push", request: c.request, refresh: c.refresh });
  expect(result.allowed).toBe(true); expect(result.basis).toBe("adopted"); expect(c.fetches()).toBe(1);
  expect(result.sources.map(s => s.path)).toEqual(["AGENTS.md", ".vh-adlc/audit.json", "audit-project.md"]);
  expect(result.default_commit).toBe(git(c.f.root, "rev-parse", "HEAD"));
  expect(result.pending_conditions).toBe(true); // Policy semantics/gates remain a separate obligation.
});

test.each(Object.keys(fields))("missing or duplicated %s never grants authority", field => {
  for (const duplicate of [false, true]) {
    const values = { ...fields }; delete values[field as keyof typeof fields];
    const c = adopted(values as typeof fields);
    if (duplicate) { c.f.write("audit-project.md", policy() .replace("| " + field + " |", `| ${field} | ${fields[field as keyof typeof fields]} |\n| ${field} |`));
      const head = c.f.commit(); git(c.f.root, "update-ref", "refs/remotes/origin/main", head); }
    expect(inspectAuthority(c.config, { mode: "fix", ids: ["AUD-001"], workstream: "A", effect: "branch-push", request: c.request, refresh: c.refresh }).allowed).toBe(false);
  }
});

test.each([
  { repository: "other/project" }, { hostname: "other.example" }, { default_branch: "other" }, { ledger_path: "elsewhere.md" },
  { extra: "invented" }, { status_effects: "ledger-update" }, { reverify_effects: "ledger-commit" },
  { full_effects: "none,ledger-update" }, { fix_effects: "branch-push" }, { fix_effects: "local-commit" },
  { fix_effects: "source-edit,ledger-update,local-commit,pr-write" },
  { fix_effects: "source-edit,ledger-update,local-commit,conditional-merge" },
  { fix_effects: "source-edit,source-edit" }, { fix_effects: "release" }, { selection_policy: "other.md#selection" },
  { verification_policy: "#missing" }, { merge_policy: "" },
])("invalid identity, effect subset or policy pointer is denied: %j", changes => {
  const c = adopted({ ...fields, ...changes });
  expect(inspectAuthority(c.config, { mode: "fix", ids: ["AUD-001"], workstream: "A", effect: "branch-push", request: c.request, refresh: c.refresh }).allowed).toBe(false);
});

test("duplicate declarations, policy anchors or tables are invalid rather than arbitrary first matches", () => {
  for (const suffix of ["\n## Standing audit workflow authorization\n" + policy(), "\n## Merge\nAmbiguous.\n", "\n| Field | Value |\n| --- | --- |\n| repository | example/project |\n"]) {
    const c = adopted(); c.f.write("audit-project.md", policy() + suffix); const commit = c.f.commit();
    git(c.f.root, "update-ref", "refs/remotes/origin/main", commit);
    expect(inspectCandidatePolicy(loadSettings(c.f.root), { default_branch: "main" }).valid).toBe(false);
  }
});

test("candidate policy validates shape without acquiring an adopted permission", () => {
  const c = adopted(), result = inspectCandidatePolicy(c.config, { default_branch: "main" });
  expect(result.valid).toBe(true); expect(result.allowed).toBe(false); expect(c.fetches()).toBe(0);
});

test.each(["unmerged", "dirty", "agents", "origin", "fetch", "no-fetch", "selection", "mode", "read-only", "no-push"])(
  "a %s boundary cannot acquire an adopted remote grant", kind => {
    const c = adopted(), original = git(c.f.root, "rev-parse", "HEAD");
    if (kind === "unmerged") { c.f.write("audit-project.md", policy().replace("# Project audit", "# Candidate")); c.f.commit(); }
    if (kind === "dirty") c.f.write("audit-project.md", policy().replace("# Project audit", "# Forged"));
    if (kind === "agents") { c.f.write("AGENTS.md", "# Missing adoption link\n"); git(c.f.root, "update-ref", "refs/remotes/origin/main", c.f.commit()); }
    if (kind === "origin") git(c.f.root, "remote", "set-url", "origin", "https://github.com/other/project");
    const result = inspectAuthority(c.config, {
      mode: kind === "mode" ? "reverify" : "fix", ids: kind === "selection" ? ["AUD-002"] : ["AUD-001"], workstream: "A",
      effect: "branch-push", request: c.request, no_fetch: kind === "no-fetch",
      restrictions: kind === "read-only" ? ["read-only"] : kind === "no-push" ? ["no-push"] : [],
      refresh: kind === "fetch" ? () => { throw Error("unavailable"); } : c.refresh,
    });
    expect(result.allowed).toBe(false);
    if (kind === "unmerged") expect(git(c.f.root, "rev-parse", "refs/remotes/origin/main")).toBe(original);
  },
);

test("least-privilege declarations and explicit requests do not invent or revoke each other's grants", () => {
  const c = adopted({ ...fields, reverify_effects: "ledger-update", full_effects: "none", fix_effects: "none" });
  const action = { mode: "fix" as const, ids: ["AUD-001"], workstream: "A", request: c.request, refresh: c.refresh };
  expect(inspectAuthority(c.config, { ...action, effect: "local-commit" }).basis).toBe("current-request");
  expect(inspectAuthority(c.config, { ...action, effect: "branch-push" }).allowed).toBe(false);
  expect(inspectAuthority(c.config, { ...action, effect: "branch-push", request: { ...c.request, effects: ["branch-push"] } }).basis).toBe("current-request");
  expect(inspectAuthority(c.config, { ...action, effect: "local-commit", restrictions: ["no-commit"] }).allowed).toBe(false);
  expect(inspectAuthority(c.config, { ...action, effect: "source-edit", prohibited_effects: ["source-edit"] }).allowed).toBe(false);
  expect(readFileSync(join(c.f.root, "audit-project.md"), "utf8")).toBe(policy({ ...fields, reverify_effects: "ledger-update", full_effects: "none", fix_effects: "none" }));
});

test("a generic selected eligible repair gets local authority and no live or remote permission", () => {
  const f = fixture(); projects.push(f); const config = loadSettings(f.root);
  const request = { authorized: true, mode: "fix" as const, ids: ["AUD-001"], eligible_repair: true };
  for (const effect of ["source-edit", "ledger-update", "local-commit", "live-verify", "issue-write", "branch-push", "pr-write", "conditional-merge"] as const) {
    expect(inspectAuthority(config, { mode: "fix", ids: ["AUD-001"], effect, request, no_fetch: true }).allowed).toBe(["source-edit", "ledger-update", "local-commit"].includes(effect));
  }
  expect(inspectAuthority(config, { mode: "status", ids: ["AUD-001"], effect: "ledger-update", request: { ...request, mode: "status", effects: ["ledger-update"] }, no_fetch: true }).allowed).toBe(false);
  expect(inspectAuthority(config, { mode: "fix", ids: ["AUD-999"], effect: "source-edit", request: { ...request, ids: ["AUD-999"] }, no_fetch: true }).allowed).toBe(false);
});
