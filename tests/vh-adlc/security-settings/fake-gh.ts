// A small model of the GitHub REST endpoints the security-settings helper uses. Tests call `handle`
// in process; run as a script, it stands in for `gh` and keeps its state in SECURITY_SETTINGS_FIXTURE.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

export type Author = { login: string; type: string };
export type Failure = { method: string; path: string; status: number };
export type FakeState = {
  hostname: string;
  repository: string;
  visibility: "public" | "private" | "internal";
  archived: boolean;
  default_branch: string;
  admin: boolean;
  alerts: boolean;
  updates: { enabled: boolean; paused: boolean };
  secret_scanning: boolean;
  push_protection: boolean;
  analysis_null: boolean;
  advanced_security: boolean;
  code_security: boolean;
  files: Record<string, string>;
  pulls: { number: number; user: Author }[];
  issues: { number: number; title: string; user: Author; pull_request?: Record<string, unknown> }[];
  fail: Failure[];
  noop: string[];
};
export type Call = { method: string; endpoint: string; hostname: string | null; body: string | null; argv: string[] };
export type Reply = { code: number; stdout: string; stderr: string };

export function state(overrides: Partial<FakeState> = {}): FakeState {
  return { hostname: "github.com", repository: "example/project", visibility: "public", archived: false, default_branch: "main", admin: true,
    alerts: false, updates: { enabled: false, paused: false }, secret_scanning: false, push_protection: false, analysis_null: false,
    advanced_security: false, code_security: false, files: {}, pulls: [], issues: [], fail: [], noop: [], ...overrides };
}

const status = (on: boolean) => ({ status: on ? "enabled" : "disabled" });
const ok = (value?: unknown): Reply => ({ code: 0, stdout: value === undefined ? "" : JSON.stringify(value), stderr: "" });
const error = (code: number, message: string): Reply => ({ code: 1, stdout: JSON.stringify({ message, status: String(code) }), stderr: `gh: ${message} (HTTP ${code})\n` });

export function parse(argv: string[]) {
  const args = argv[0] === "gh" ? argv.slice(1) : argv;
  if (args[0] !== "api") throw Error("fake gh serves only api");
  let method = "GET", hostname: string | null = null, endpoint = "", paginate = false, slurp = false, input = false;
  for (let index = 1; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--hostname") hostname = args[++index] ?? null;
    else if (arg === "--method" || arg === "-X") method = args[++index] ?? "";
    else if (arg === "--paginate") paginate = true;
    else if (arg === "--slurp") slurp = true;
    else if (arg === "--input") input = args[++index] === "-";
    else if (arg.startsWith("-")) throw Error(`fake gh does not model ${arg}`);
    else endpoint = arg;
  }
  return { method, hostname, endpoint, paginate, slurp, input };
}

export function handle(fake: FakeState, argv: string[], stdin: string | null): { reply: Reply; call: Call } {
  const request = parse(argv), call: Call = { method: request.method, endpoint: request.endpoint, hostname: request.hostname, body: stdin, argv };
  const [route = "", query = ""] = request.endpoint.split("?"), params = new URLSearchParams(query), base = `repos/${fake.repository}`;
  const reply = (): Reply => {
    const failure = fake.fail.find(item => item.method === request.method && (item.path === route || item.path.endsWith("*") && route.startsWith(item.path.slice(0, -1))));
    if (failure) return error(failure.status, "Fixture failure");
    if (route !== base && !route.startsWith(`${base}/`)) return error(404, "Not Found");
    const rest = route.slice(base.length), admin = () => fake.admin ? null : error(403, "Must have admin rights to Repository.");
    if (rest === "" && request.method === "GET") {
      const analysis = fake.analysis_null ? null : { secret_scanning: status(fake.secret_scanning), secret_scanning_push_protection: status(fake.push_protection),
        dependabot_security_updates: status(fake.updates.enabled), ...(fake.advanced_security ? { advanced_security: status(true) } : {}), ...(fake.code_security ? { code_security: status(true) } : {}) };
      return ok({ full_name: fake.repository, visibility: fake.visibility, private: fake.visibility !== "public", archived: fake.archived, default_branch: fake.default_branch,
        permissions: { admin: fake.admin, push: true, pull: true }, ...(fake.admin ? { security_and_analysis: analysis } : {}) });
    }
    if (rest === "" && request.method === "PATCH") {
      const denied = admin(); if (denied) return denied;
      if (fake.archived) return error(403, "Repository was archived so is read-only.");
      const body = (JSON.parse(stdin ?? "{}") as { security_and_analysis?: Record<string, { status: string }> }).security_and_analysis ?? {};
      if (fake.visibility !== "public" && Object.keys(body).length) return error(422, "Secret scanning is not available for this repository.");
      if (!fake.noop.includes("PATCH repos")) {
        if (body.secret_scanning) fake.secret_scanning = body.secret_scanning.status === "enabled";
        if (body.secret_scanning_push_protection) fake.push_protection = body.secret_scanning_push_protection.status === "enabled";
      }
      return ok({ full_name: fake.repository });
    }
    if (rest === "/vulnerability-alerts") {
      const denied = admin(); if (denied) return denied;
      if (request.method === "GET") return fake.alerts ? ok() : error(404, "Not Found");
      if (request.method === "PUT") { if (!fake.noop.includes("PUT vulnerability-alerts")) fake.alerts = true; return ok(); }
      if (request.method === "DELETE") { fake.alerts = false; return ok(); }
    }
    if (rest === "/automated-security-fixes") {
      const denied = admin(); if (denied) return denied;
      if (request.method === "GET") return ok({ ...fake.updates });
      if (request.method === "PUT") {
        if (!fake.alerts) return error(422, "Dependabot alerts must be enabled.");
        if (!fake.noop.includes("PUT automated-security-fixes")) fake.updates = { ...fake.updates, enabled: true };
        return ok();
      }
      if (request.method === "DELETE") { fake.updates = { ...fake.updates, enabled: false }; return ok(); }
    }
    if (rest.startsWith("/contents/") && request.method === "GET") {
      const path = decodeURIComponent(rest.slice("/contents/".length));
      if (params.get("ref") !== fake.default_branch || !Object.hasOwn(fake.files, path)) return error(404, "Not Found");
      return ok({ type: "file", path, encoding: "base64", content: Buffer.from(fake.files[path]!).toString("base64") });
    }
    if (rest === "/pulls" && request.method === "GET") {
      if (params.get("state") !== "all" || !request.paginate || !request.slurp) return error(400, "fixture expects every pull request, paginated and slurped");
      return ok([fake.pulls]);
    }
    if (rest === "/issues" && request.method === "GET") {
      if (params.get("state") !== "open" || !request.paginate || !request.slurp) return error(400, "fixture expects open issues, paginated and slurped");
      return ok([fake.issues]);
    }
    return error(404, "Not Found");
  };
  return { reply: reply(), call };
}

if (import.meta.main) {
  const path = process.env.SECURITY_SETTINGS_FIXTURE;
  if (!path) { process.stderr.write("fixture path missing\n"); process.exit(1); }
  const fake = JSON.parse(readFileSync(path, "utf8")) as FakeState, argv = process.argv.slice(2);
  const stdin = parse(argv).input ? readFileSync(0, "utf8") : null;
  const { reply, call } = handle(fake, argv, stdin);
  appendFileSync(path + ".calls", JSON.stringify({ ...call, gh_host: process.env.GH_HOST ?? null }) + "\n");
  writeFileSync(path, JSON.stringify(fake));
  process.stdout.write(reply.stdout); process.stderr.write(reply.stderr);
  process.exit(reply.code);
}
