// Entry for the loop operations (references/loop-settings.md, references/review-protocol.md).
//
//   bun scripts/loop/cli.ts route   --repo <dir> --operation <op> [--continues <op>]
//   bun scripts/loop/cli.ts context --repo <dir>
//   bun scripts/loop/cli.ts rungs   --repo <dir> (--base <branch> | --merge <sha>) [--allow <rung>[,<rung/subcheck>...]] [--run true]
//   bun scripts/loop/cli.ts ci       --repo <dir>
//   bun scripts/loop/cli.ts skip     --repo <dir> --base <branch> --remote-branch <ref> --feature-root <dir> --docs-revision <sha>
//   bun scripts/loop/cli.ts delivery --repo <dir> --merge <sha> --feature-root <dir> --docs-revision <sha>
//   bun scripts/loop/cli.ts isolation --repo <dir> --host-worktree-tool true|false
//   bun scripts/loop/cli.ts claim    --repo <dir> --document <doc> --feature-branch <b> --default-branch <b> --status-description <text>
//                                    --message <text> [--owned <branch>[,<branch>...]]
//   bun scripts/loop/cli.ts review --repo <dir> --document <doc> --commit <sha> --kind spec|implementation
//                                  --docs-revision <sha> --binary <path> --plugin-pin <pin> [--timeout-ms <n>]
//
// `route` prints the role and route an operation runs on. `review` runs a reviewer role's command
// route and prints its outcome; for a host route it prints the route and runs nothing, because the
// host dispatches its own reviewer. Output is one JSON object on stdout.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadLoopSettings, loadLoopSettingsAt, routeFor, type LoopOperation } from "./settings";
import { runReviewRoute } from "./review-route";
import { loopContext, type LoopContext } from "./procedure";
import { applicableRungs, featureDelta, mayAdvance, runRungs } from "./rungs";
import { ciReport, conventionSupportsSkipPaths, deliveryVerdict, skipMarker } from "./delivery";
import { claim, isolation } from "./claim";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

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
  // A review reads its policy from the reviewed commit; only the other commands read the working tree.
  const settings = command === "review" ? (undefined as unknown as ReturnType<typeof loadLoopSettings>) : loadLoopSettings(repo);
  if (command === "route") {
    const operation = need(options, "operation") as LoopOperation;
    console.log(JSON.stringify(routeFor(settings, operation, options.continues ? { continues: options.continues as Exclude<LoopOperation, "resume"> } : {})));
    return 0;
  }
  if (command === "context") { console.log(JSON.stringify(loopContext(settings))); return 0; }
  if (command === "isolation") { console.log(JSON.stringify(isolation(settings, repo, { hostWorktreeTool: options["host-worktree-tool"] === "true" }))); return 0; }
  if (command === "claim") {
    const document = need(options, "document"), featureBranch = need(options, "feature-branch"), description = need(options, "status-description");
    const result = await claim(repo, { document, featureBranch, defaultBranch: need(options, "default-branch"), message: need(options, "message"),
      ownedBranches: options.owned ? options.owned.split(",") : [],
      edit: root => {
        const path = join(root, document), text = readFileSync(path, "utf8");
        const end = text.indexOf("\n---\n", 4);
        if (!text.startsWith("---\n") || end < 0 || !/^status: planned$/m.test(text.slice(0, end))) throw Error("the document is not a planned feature document");
        let front = text.slice(0, end).replace(/^status: planned$/m, "status: in-progress")
          .replace(/^status_description: .*$/m, `status_description: ${JSON.stringify(description)}`);
        front = /^branch: /m.test(front) ? front : front.replace(/^(issue: .*)$/m, `$1\nbranch: ${featureBranch}`);
        writeFileSync(path, front + text.slice(end));
      } });
    console.log(JSON.stringify(result)); return result.status === "claimed" ? 0 : 3;
  }
  if (command === "ci") { console.log(JSON.stringify(ciReport(settings))); return 0; }
  if (command === "skip") {
    const names = (range: string[]) => execSync(`git diff --name-only ${range.join(" ")}`, { cwd: repo }).toString().split("\n").filter(Boolean);
    const base = execSync(`git merge-base ${need(options, "base")} HEAD`, { cwd: repo }).toString().trim();
    const supportsSkipPaths = conventionSupportsSkipPaths(need(options, "docs-revision"));
    const result = skipMarker(settings, { commit: names(["HEAD^", "HEAD"]), pushRange: names([`${need(options, "remote-branch")}`, "HEAD"]), prDiff: names([base, "HEAD"]) },
      { supportsSkipPaths, featureRoot: need(options, "feature-root") });
    console.log(JSON.stringify(result)); return 0;
  }
  if (command === "delivery") {
    const verdict = await deliveryVerdict(settings, repo, need(options, "merge"), { featureRoot: need(options, "feature-root"), supportsSkipPaths: conventionSupportsSkipPaths(need(options, "docs-revision")) });
    console.log(JSON.stringify(verdict)); return verdict.delivered ? 0 : 3;
  }
  if (command === "rungs") {
    const declared = settings.verification_rungs.length > 0;
    const delta = featureDelta(repo, options.merge ? { merge: options.merge } : { base: need(options, "base") });
    const applicable = applicableRungs(settings, delta.paths);
    const results = options.run === "true" ? (await runRungs(repo, applicable)).map(({ output, ...rest }) => ({ ...rest, output_tail: output?.slice(-2000) })) : [];
    const head = execSync("git rev-parse HEAD", { cwd: repo }).toString().trim();
    const verdict = options.run === "true" ? mayAdvance(results, { head, declared, allowances: options.allow ? options.allow.split(",") : [] })
      : { advance: !declared, lookup: declared ? "rungs" : "agents-md", blocking: applicable.map(r => r.name) };
    console.log(JSON.stringify({ declared, range: delta.range, paths: delta.paths, applicable: applicable.map(r => r.name), results, ...verdict }));
    return verdict.advance ? 0 : 3;
  }
  if (command === "review") {
    const kind = need(options, "kind");
    if (kind !== "spec" && kind !== "implementation") throw Error("--kind must be spec or implementation");
    // The review policy is the one committed at the reviewed commit, never the working tree's.
    const policy = loadLoopSettingsAt(repo, need(options, "commit"));
    const route = routeFor(policy, kind === "spec" ? "spec review" : "review");
    if (route.route !== "command" || !route.argv) { console.log(JSON.stringify({ status: "host", ...route })); return 0; }
    const document = need(options, "document"), commit = need(options, "commit");
    const prompt = reviewPrompt({ repository: kind === "spec" ? "the current directory, a read-only export of the commit" : repo,
      document, commit, kind, docsRevision: need(options, "docs-revision"), binary: need(options, "binary"), pluginPin: need(options, "plugin-pin") }, loopContext(policy));
    const outcome = await runReviewRoute({ repo, commit, kind, document, route: { model: route.model!, argv: route.argv, ...(route.model_attestation ? { model_attestation: route.model_attestation } : {}) }, prompt,
      scratch: policy.review_scratch, timeoutMs: options["timeout-ms"] ? Number(options["timeout-ms"]) : undefined });
    console.log(JSON.stringify({ role: route.role, ...outcome }));
    return outcome.status === "ready" ? 0 : 3;
  }
  throw Error(`unknown command ${command ?? ""}; use route, context, rungs, ci, skip, delivery, isolation, claim or review`);
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(code => process.exit(code), error => {
    console.log(JSON.stringify({ status: "error", reason: (error as Error).message }));
    process.exit(2);
  });
}
