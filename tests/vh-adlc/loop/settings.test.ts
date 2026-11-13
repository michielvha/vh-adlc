// Loop settings: the route each loop role runs on, read from `.vh-adlc/loop.yaml`.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadLoopSettings, routeFor } from "../../../plugins/vh-adlc/scripts/loop/settings";

const made: string[] = [];
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

function checkout(files: Record<string, string> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vh-loop-settings-")));
  made.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
function refusal(run: () => unknown): string {
  try { run(); } catch (error) { return String(error); }
  throw Error("the settings were accepted");
}

const reviewer = `    route: command
    model: gpt-6.1-sol
    argv: [/usr/bin/copilot, --model, "{model}", -p, "{prompt}"]
`;
const full = `schema_version: 1
roles:
  author:
    route: host
    model: opus
  implementer:
    route: host
    model: opus
  spec_reviewer:
${reviewer}  implementation_reviewer:
${reviewer}`;

describe("a repository without loop settings", () => {
  test("keeps today's behavior: every role inherits the host default", () => {
    const settings = loadLoopSettings(checkout(), { overridePath: null });
    expect(settings.configured).toBe(false);
    for (const role of ["author", "implementer", "spec_reviewer", "implementation_reviewer"] as const)
      expect(settings.roles[role]).toEqual({ route: "host" });
    expect(routeFor(settings, "spec review")).toEqual({ role: "spec_reviewer", route: "host" });
  });
});

describe("declared routes", () => {
  test("each role gets its declared route and model", () => {
    const settings = loadLoopSettings(checkout({ ".vh-adlc/loop.yaml": full }), { overridePath: null });
    expect(settings.configured).toBe(true);
    expect(settings.roles.author).toEqual({ route: "host", model: "opus" });
    expect(settings.roles.spec_reviewer).toEqual({ route: "command", model: "gpt-6.1-sol", argv: ["/usr/bin/copilot", "--model", "{model}", "-p", "{prompt}"] });
  });

  test("every SDD operation maps to its role", () => {
    const settings = loadLoopSettings(checkout({ ".vh-adlc/loop.yaml": full }), { overridePath: null });
    const expected: Record<string, string> = { spec: "author", tasks: "author", investigate: "author", implement: "implementer",
      ship: "implementer", "spec review": "spec_reviewer", review: "implementation_reviewer" };
    for (const [operation, role] of Object.entries(expected)) expect(routeFor(settings, operation as never).role).toBe(role);
  });

  test("resume takes the route of the operation it continues", () => {
    const settings = loadLoopSettings(checkout({ ".vh-adlc/loop.yaml": full }), { overridePath: null });
    expect(routeFor(settings, "resume", { continues: "review" })).toEqual({ role: "implementation_reviewer", ...settings.roles.implementation_reviewer });
    expect(routeFor(settings, "resume", { continues: "implement" })).toEqual({ role: "implementer", route: "host", model: "opus" });
    expect(refusal(() => routeFor(settings, "resume"))).toContain("resume needs the operation it continues");
  });
});

describe("refused settings", () => {
  const cases: [string, string, string][] = [
    ["a command route for the author", "schema_version: 1\nroles:\n  author:\n" + reviewer, "roles.author: a command route is only for reviewer roles"],
    ["a command route for the implementer", "schema_version: 1\nroles:\n  implementer:\n" + reviewer, "roles.implementer: a command route is only for reviewer roles"],
    ["a command route without a prompt placeholder", "schema_version: 1\nroles:\n  spec_reviewer:\n    route: command\n    model: m\n    argv: [cli, -p, text]\n", "roles.spec_reviewer.argv needs {prompt} or {prompt_file}"],
    ["a command route without a model", "schema_version: 1\nroles:\n  spec_reviewer:\n    route: command\n    argv: [cli, -p, \"{prompt}\"]\n", "roles.spec_reviewer.model"],
    ["argv on a host route", "schema_version: 1\nroles:\n  author:\n    route: host\n    argv: [cli]\n", "roles.author contains unsupported fields"],
    ["an unknown role", "schema_version: 1\nroles:\n  deployer:\n    route: host\n", "roles contains unsupported fields"],
    ["an unknown top-level key", "schema_version: 1\nreviewer_model: x\n", "settings contains unsupported fields"],
    ["a missing schema version", "roles:\n  author:\n    route: host\n", "schema_version must be 1"],
    ["an unknown route", "schema_version: 1\nroles:\n  author:\n    route: remote\n", "roles.author.route must be host or command"],
  ];
  for (const [name, yaml, reason] of cases)
    test(name, () => { expect(refusal(() => loadLoopSettings(checkout({ ".vh-adlc/loop.yaml": yaml }), { overridePath: null }))).toContain(reason); });
});

describe("the per-user override", () => {
  test("may replace a command route's executable and nothing else", () => {
    const root = checkout({ ".vh-adlc/loop.yaml": full });
    const override = join(checkout(), "loop.local.yaml");
    writeFileSync(override, "schema_version: 1\nroles:\n  spec_reviewer:\n    executable: /home/someone/bin/copilot\n");
    const settings = loadLoopSettings(root, { overridePath: override });
    expect(settings.roles.spec_reviewer.argv?.[0]).toBe("/home/someone/bin/copilot");
    expect(settings.roles.spec_reviewer.argv?.slice(1)).toEqual(["--model", "{model}", "-p", "{prompt}"]);
    expect(settings.roles.spec_reviewer.model).toBe("gpt-6.1-sol");
    expect(settings.roles.implementation_reviewer.argv?.[0]).toBe("/usr/bin/copilot");
  });

  for (const [name, body, reason] of [
    ["a model", "    model: other\n", "override roles.spec_reviewer contains unsupported fields"],
    ["arguments", "    argv: [x]\n", "override roles.spec_reviewer contains unsupported fields"],
  ] as const)
    test(`refuses ${name}`, () => {
      const override = join(checkout(), "loop.local.yaml");
      writeFileSync(override, `schema_version: 1\nroles:\n  spec_reviewer:\n${body}`);
      expect(refusal(() => loadLoopSettings(checkout({ ".vh-adlc/loop.yaml": full }), { overridePath: override }))).toContain(reason);
    });

  // Changed after R-23 F-01: the override file is per user and shared by every repository, so an entry
  // for a role this repository routes to the host is ignored rather than refused.
  test("ignores an executable for a host route, which belongs to another repository", () => {
    const override = join(checkout(), "loop.local.yaml");
    writeFileSync(override, "schema_version: 1\nroles:\n  author:\n    executable: /bin/true\n");
    const root = checkout({ ".vh-adlc/loop.yaml": full });
    expect(loadLoopSettings(root, { overridePath: override }).roles).toEqual(loadLoopSettings(root, { overridePath: null }).roles);
  });

  test("a missing override file changes nothing", () => {
    const settings = loadLoopSettings(checkout({ ".vh-adlc/loop.yaml": full }), { overridePath: join(checkout(), "absent.yaml") });
    expect(settings.roles.spec_reviewer.argv?.[0]).toBe("/usr/bin/copilot");
  });
});
