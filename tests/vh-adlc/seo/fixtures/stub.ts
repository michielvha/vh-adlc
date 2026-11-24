// A Semrush stand-in for the forward scenarios. It answers the v3 report API, the
// balance request and the MCP endpoint on one loopback port, refuses any other key,
// and logs every request with the answer it gave. MCP replies are copies of the
// archived responses in ./mcp/, with the request id, rows and units filled in.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Answer = "data" | "no_data";
export type StubConfig = {
  // The answer for a report type, target and database (undefined: none named).
  answer: (report: string, target: string, database: string | undefined) => Answer;
  // The MCP handshake answers HTTP 401, as the 3 November handshake did.
  expired?: boolean;
};
export type Logged = {
  route: "v3" | "mcp" | "balance";
  kind: "report" | "balance" | "initialize" | "initialized" | "call" | "other";
  report?: string;
  target?: string;
  database?: string;
  display_limit?: number;
  answer?: Answer | "refused";
};

const PRICE = 10;
const mcpDir = join(import.meta.dir, "mcp");

function mcpFixture(name: string): Record<string, unknown> {
  const path = join(mcpDir, name);
  if (!existsSync(path)) throw new Error(`missing MCP fixture ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function csv(rows: number) {
  const lines = ["Domain;Rank;Organic Keywords;Organic Traffic"];
  for (let i = 0; i < rows; i++) lines.push(`fixture.example;${1000 + i};${50 - i};${200 - i}`);
  return lines.join("\n");
}

export class SemrushStub {
  log: Logged[] = [];
  server!: ReturnType<typeof Bun.serve>;
  constructor(private config: StubConfig, private key: string) {}

  start() {
    this.server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (request) => this.handle(request) });
    return this;
  }

  get base() {
    return `http://127.0.0.1:${this.server.port}`;
  }

  clear() {
    this.log = [];
  }

  stop() {
    this.server.stop(true);
  }

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") return new Response("ok");
    if (url.pathname === "/users/countapiunits.html") {
      this.log.push({ route: "balance", kind: "balance" });
      return new Response(url.searchParams.get("key") === this.key ? "125,000" : "0");
    }
    if (url.pathname === "/" && request.method === "GET") return this.v3(url.searchParams);
    if (url.pathname === "/v2/mcp" && request.method === "POST") return this.mcp(request);
    this.log.push({ route: "v3", kind: "other" });
    return new Response("not found", { status: 404 });
  }

  private v3(query: URLSearchParams): Response {
    const type = query.get("type") ?? "";
    const report = type === "domain_organic" ? "resource_organic" : type;
    const target = query.get("domain") ?? "";
    const database = query.get("database") ?? undefined;
    const display_limit = Number(query.get("display_limit") ?? "0");
    if (query.get("key") !== this.key) {
      this.log.push({ route: "v3", kind: "report", report, target, database, display_limit, answer: "refused" });
      return new Response("ERROR 120 :: WRONG KEY - ID PAIR", { status: 403 });
    }
    const answer = this.config.answer(report, target, database);
    this.log.push({ route: "v3", kind: "report", report, target, database, display_limit, answer });
    if (answer === "no_data") return new Response("ERROR 50 :: NOTHING FOUND", { status: 400 });
    return new Response(csv(display_limit));
  }

  private async mcp(request: Request): Promise<Response> {
    if (request.headers.get("authorization") !== `Apikey ${this.key}` || this.config.expired) {
      this.log.push({ route: "mcp", kind: "initialize", answer: "refused" });
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
    const message = (await request.json()) as { id?: number | string; method?: string; params?: { name?: string; arguments?: { report?: string; params?: Record<string, unknown> } } };
    if (message.method === "initialize") {
      this.log.push({ route: "mcp", kind: "initialize" });
      return Response.json({ ...mcpFixture("initialize-response.json"), id: message.id }, { headers: { "mcp-session-id": "fixture-session" } });
    }
    if (message.method === "notifications/initialized") {
      this.log.push({ route: "mcp", kind: "initialized" });
      return new Response(null, { status: 202 });
    }
    if (message.method !== "tools/call" || message.params?.name !== "execute_report") {
      this.log.push({ route: "mcp", kind: "other" });
      return Response.json({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "method not found" } });
    }
    const args = message.params.arguments ?? {};
    const params = args.params ?? {};
    const report = String(args.report ?? "");
    const target = String(params.target ?? params.domain ?? "");
    const database = typeof params.database === "string" ? params.database : undefined;
    const display_limit = Number(params.display_limit ?? 0);
    const answer = this.config.answer(report, target, database);
    this.log.push({ route: "mcp", kind: "call", report, target, database, display_limit, answer });
    if (answer === "no_data") return Response.json({ ...mcpFixture("no-data-response.json"), id: message.id });
    const success = mcpFixture("success-response.json") as { result: { content: { type: string; text: string }[]; structuredContent?: unknown } };
    const payload = JSON.parse(success.result.content[0].text) as { data: string; metadata: { usage: { api_units: number } } };
    payload.data = csv(display_limit);
    payload.metadata.usage.api_units = display_limit * PRICE;
    return Response.json({
      ...success,
      id: message.id,
      result: { ...success.result, content: [{ ...success.result.content[0], text: JSON.stringify(payload) }], structuredContent: payload },
    });
  }
}
