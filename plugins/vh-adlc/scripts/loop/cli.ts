// Entry for the loop operations (references/loop-settings.md, references/review-protocol.md).
//
//   bun scripts/loop/cli.ts route   --repo <dir> --operation <op> [--continues <op>]
//   bun scripts/loop/cli.ts context --repo <dir>
//   bun scripts/loop/cli.ts review --repo <dir> --document <doc> --commit <sha> --kind spec|implementation
//                                  --docs-revision <sha> --binary <path> --plugin-pin <pin> [--timeout-ms <n>]
//
// `route` prints the role and route an operation runs on. `review` runs a reviewer role's command
// route and prints its outcome; for a host route it prints the route and runs nothing, because the
// host dispatches its own reviewer. Output is one JSON object on stdout.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadLoopSettings, routeFor, type LoopOperation } from "./settings";
import { runReviewRoute } from "./review-route";
import { loopContext, type LoopContext } from "./procedure";

const PLUGIN = join(import.meta.dir, "..", "..");

function args(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]!, value = argv[i + 1];
    if (!flag.startsWith("--") || value === undefined) throw Error(`expected --flag value pairs, got ${flag}`);
    out[flag.slice(2)] = value;
  }
  return out;
}
function need(options: Record<string, string>, name: string): string {
  const value = options[name];
  if (!value) throw Error(`missing --${name}`);
  return value;
}

/** The prompt a command-route reviewer receives: the canonical reviewer instructions and the dispatch identity. */
export function reviewPrompt(input: { repository: string; document: string; commit: string; kind: string; docsRevision: string; binary: string; pluginPin: string }, context?: LoopContext): string {
  const agent = readFileSync(join(PLUGIN, "agents", "vh-adlc-reviewer.agent.md"), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "");
  return `${agent.trim()}

## Dispatch

- Repository directory: ${input.repository}
- Document: ${input.document}
- Commit: ${input.commit}
- Review kind: ${input.kind}
- vhco-pro/docs revision: ${input.docsRevision}
- vh-adlc binary: ${input.binary}
- Plugin pin: ${input.pluginPin}

${context && context.read.length ? `Repository instructions to check the document against: ${context.read.join(", ")}
` : ""}${context && context.lenses.length ? `Declared lenses, each a check whose failure is a finding at the given severity:
${context.lensText}
` : ""}
This dispatch asks for a TARGET line: after the MODEL line, give \`TARGET: ${input.commit}\` with the exact commit you
reviewed, then the records.
`;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const options = args(rest);
  const repo = need(options, "repo");
  const settings = loadLoopSettings(repo);
  if (command === "route") {
    const operation = need(options, "operation") as LoopOperation;
    console.log(JSON.stringify(routeFor(settings, operation, options.continues ? { continues: options.continues as Exclude<LoopOperation, "resume"> } : {})));
    return 0;
  }
  if (command === "context") { console.log(JSON.stringify(loopContext(settings))); return 0; }
  if (command === "review") {
    const kind = need(options, "kind");
    if (kind !== "spec" && kind !== "implementation") throw Error("--kind must be spec or implementation");
    const route = routeFor(settings, kind === "spec" ? "spec review" : "review");
    if (route.route !== "command" || !route.argv) { console.log(JSON.stringify({ status: "host", ...route })); return 0; }
    const document = need(options, "document"), commit = need(options, "commit");
    const prompt = reviewPrompt({ repository: kind === "spec" ? "the current directory, a read-only export of the commit" : repo,
      document, commit, kind, docsRevision: need(options, "docs-revision"), binary: need(options, "binary"), pluginPin: need(options, "plugin-pin") }, loopContext(settings));
    const outcome = await runReviewRoute({ repo, commit, kind, document, route: { model: route.model!, argv: route.argv }, prompt,
      scratch: settings.review_scratch, timeoutMs: options["timeout-ms"] ? Number(options["timeout-ms"]) : undefined });
    console.log(JSON.stringify({ role: route.role, ...outcome }));
    return outcome.status === "ready" ? 0 : 3;
  }
  throw Error(`unknown command ${command ?? ""}; use route, context or review`);
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(code => process.exit(code), error => {
    console.log(JSON.stringify({ status: "error", reason: (error as Error).message }));
    process.exit(2);
  });
}
