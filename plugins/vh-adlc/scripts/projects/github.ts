import { list, object, string } from "./settings";

/** Native gh transport. No shell interprets tracker content or credentials. */
export class GitHub {
  private requests = 0;
  constructor(private readonly budget: number, private readonly options: { executable?: string; env?: Record<string, string | undefined> } = {}) {}
  query(query: string, variables: Record<string, unknown>): Record<string, unknown> {
    if (++this.requests > this.budget) throw new Error("collection request budget exhausted");
    const result = Bun.spawnSync([this.options.executable ?? "gh", "api", "graphql", "--hostname", "github.com", "--input", "-"], { stdin: Buffer.from(JSON.stringify({ query, variables })), stdout: "pipe", stderr: "pipe", env: this.options.env ?? process.env, timeout: 30000 });
    if (result.exitCode !== 0) throw new Error("GitHub request failed; verify access, network and rate limits");
    const envelope = object(JSON.parse(result.stdout.toString()));
    if (envelope.errors !== undefined && list(envelope.errors).length) throw new Error("GitHub returned incomplete data or access errors");
    return object(envelope.data);
  }
}

export const pageInfo = "pageInfo { hasNextPage endCursor }";
/** Consume every requested page or fail; partial results never become a complete inventory. */
export function pages(load: (cursor: string | null) => unknown): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [], seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const connection = object(load(cursor));
    nodes.push(...list(connection.nodes).map(object));
    const info = object(connection.pageInfo);
    if (typeof info.hasNextPage !== "boolean") throw new Error("missing pagination state");
    if (!info.hasNextPage) return nodes;
    cursor = string(info.endCursor);
    if (seen.has(cursor)) throw new Error("repeated pagination cursor");
    seen.add(cursor);
  } while (true);
}
