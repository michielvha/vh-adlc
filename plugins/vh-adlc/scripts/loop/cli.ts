// Entry for the loop operations (references/loop-settings.md, references/review-protocol.md).
//
//   bun scripts/loop/cli.ts route   --repo <dir> --operation <op> [--continues <op>]
//   bun scripts/loop/cli.ts context --repo <dir>
//   bun scripts/loop/cli.ts rungs   --repo <dir> (--base <branch> | --merge <sha>) [--stage task|completion] [--allow <rung>[,<rung/subcheck>...]] [--run true]
//                                   [--record <rung>=passed|failed:<what was observed>[;<rung>=...]]
//   bun scripts/loop/cli.ts ci       --repo <dir>
//   bun scripts/loop/cli.ts skip     --repo <dir> --base <branch> --remote-branch <ref> --feature-root <dir> --docs-revision <sha>
//   bun scripts/loop/cli.ts delivery --repo <dir> --merge <sha> --feature-root <dir> --docs-revision <sha>
//   bun scripts/loop/cli.ts isolation --repo <dir> --host-worktree-tool true|false
//   bun scripts/loop/cli.ts claim    --repo <dir> --document <doc> --feature-branch <b> --default-branch <b> --status-description <text>
//                                    --message <text> [--owned <branch>[,<branch>...]] [--client codex|claude] [--no-push true]
//   bun scripts/loop/cli.ts review --repo <dir> --document <doc> --commit <sha> --kind spec|implementation
//                                  --docs-revision <sha> --binary <path> --plugin-pin <pin> [--timeout-ms <n>]
//   bun scripts/loop/cli.ts review-scope --repo <dir> --document <doc> --commit <sha>
//
// `route` prints the role and route an operation runs on. `review` runs a reviewer role's command
// route and prints its outcome; for a host route it prints the route and runs nothing, because the
// host dispatches its own reviewer. `review-scope` prints the scope of a spec review at the commit: the
// previous spec review, the document diff since it, and whether the pass is full and why. Output is one
// JSON object on stdout.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadLoopSettings, loadLoopSettingsAt, routeFor, type LoopOperation } from "./settings";
import { runReviewRoute } from "./review-route";
import { contextReport, loopContext, type LoopContext } from "./procedure";
import { cacheReviewPages } from "./pages";
import { applicableRungs, deferredRungs, featureDelta, mayAdvance, RUNG_STAGES, runRungs, type RungStage } from "./rungs";
import { ciReport, conventionSupportsSkipPaths, deliveryVerdict, repositoryVisibility, skipMarker } from "./delivery";
import { claim, isolation } from "./claim";
import { diffPaths, rangePaths } from "./git-paths";
import { reviewScope, type ReviewScope } from "./review-scope";
import { writeFileSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";

const PLUGIN = join(import.meta.dir, "..", "..");

function args(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]!, value = argv[i + 1];
    if (!flag.startsWith("--") || value === undefined) throw Error(`expected --flag value pairs, got ${flag}`);
    // --record may repeat; every value is kept, separated by a NUL no shell argument can contain.
    out[flag.slice(2)] = flag === "--record" && out.record !== undefined ? `${out.record}\0${value}` : value;
  }
  return out;
}
function need(options: Record<string, string>, name: string): string {
  const value = options[name];
  if (!value) throw Error(`missing --${name}`);
  return value;
}

/** The prompt a command-route reviewer receives: the canonical reviewer instructions and the dispatch identity. */
export function reviewPrompt(input: { repository: string; document: string; commit: string; kind: string; docsRevision: string; binary: string; pluginPin: string; scope?: ReviewScope }, context?: LoopContext): string {
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
${scopeLines(input.scope)}
${context && context.read.length ? `Repository instructions to check the document against: ${context.read.join(", ")}
` : ""}${context && context.lenses.length ? `Declared lenses, each a check whose failure is a finding at the given severity:
${context.lensText}
` : ""}
This dispatch asks for a TARGET line: after the MODEL line, give \`TARGET: ${input.commit}\` with the exact commit you
reviewed, then the records.
`;
}

/** The dispatch lines for a spec review's scope; an implementation review has none. */
function scopeLines(scope?: ReviewScope): string {
  if (!scope) return "";
  if (scope.full) return `- Scope: full pass (${scope.reason})\n`;
  return `- Scope: scoped re-review since the previous spec review at ${scope.previous}; the document diff since then, without its Review Log:

\`\`\`diff
${scope.diff.trimEnd()}
\`\`\`
`;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const options = args(rest);
  const repo = need(options, "repo");
  // A review reads its policy from the reviewed commit; only the other commands read the working tree.
  if (command === "review-scope") {
    console.log(JSON.stringify(reviewScope(repo, need(options, "document"), need(options, "commit"))));
    return 0;
  }
  const settings = command === "review" ? (undefined as unknown as ReturnType<typeof loadLoopSettings>) : loadLoopSettings(repo);
  if (command === "route") {
    const operation = need(options, "operation") as LoopOperation;
    console.log(JSON.stringify(routeFor(settings, operation, options.continues ? { continues: options.continues as Exclude<LoopOperation, "resume"> } : {})));
    return 0;
  }
  if (command === "context") { console.log(JSON.stringify(contextReport(settings, options["default-branch"]))); return 0; }
  if (command === "isolation") { console.log(JSON.stringify(isolation(settings, repo, { hostWorktreeTool: options["host-worktree-tool"] === "true" }))); return 0; }
  if (command === "claim") {
    const document = need(options, "document"), featureBranch = need(options, "feature-branch"), description = need(options, "status-description");
    const result = await claim(repo, { document, featureBranch, defaultBranch: need(options, "default-branch"), message: need(options, "message"),
      client: options.client, noPush: options["no-push"] === "true",
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
  if (command === "ci") {
    const visibility = settings.ci_trigger === "manual" ? "unknown" : repositoryVisibility(repo);
    console.log(JSON.stringify(ciReport(settings, visibility))); return 0;
  }
  if (command === "skip") {
    const base = execSync(`git merge-base ${need(options, "base")} HEAD`, { cwd: repo }).toString().trim();
    const supportsSkipPaths = conventionSupportsSkipPaths(need(options, "docs-revision"));
    // The push range counts every path any outgoing commit touched, so a change reverted later still counts.
    const result = skipMarker(settings, { commit: diffPaths(repo, "HEAD^", "HEAD"), pushRange: rangePaths(repo, `${need(options, "remote-branch")}..HEAD`), prDiff: diffPaths(repo, base, "HEAD") },
      { supportsSkipPaths, featureRoot: need(options, "feature-root") });
    console.log(JSON.stringify(result)); return 0;
  }
  if (command === "delivery") {
    const verdict = await deliveryVerdict(settings, repo, need(options, "merge"), { featureRoot: need(options, "feature-root"), supportsSkipPaths: conventionSupportsSkipPaths(need(options, "docs-revision")) });
    console.log(JSON.stringify(verdict)); return verdict.delivered ? 0 : 3;
  }
  if (command === "rungs") {
    // Without --stage the command checks every applicable rung, so a caller that forgets it never checks less.
    const stage = (options.stage ?? "completion") as RungStage;
    if (!RUNG_STAGES.includes(stage)) throw Error(`--stage must be task or completion, got ${options.stage}`);
    if (stage === "task" && options.merge) throw Error("--stage task does not apply after a merge: delivery is a completion-stage check");
    const declared = settings.verification_rungs.length > 0;
    const delta = featureDelta(repo, options.merge ? { merge: options.merge } : { base: need(options, "base") });
    const applicable = applicableRungs(settings, delta.paths, stage);
    // Reported with or without --run, so implement's Finish can learn what ship still has to run.
    const deferred = deferredRungs(settings, delta.paths, stage).map(rung => rung.name);
    // A procedure rung's result is recorded by the operation that performed it, at the current head.
    // Each --record holds one record or several joined by ";". A ";" splits only where another
    // <rung>=passed|failed: follows, so a record's own text may contain one.
    const entries = (options.record ?? "").split("\0").flatMap(value => value.split(/;(?=\s*[a-z0-9-]+=(?:passed|failed):)/)).map(entry => entry.trim()).filter(Boolean);
    const recorded = new Map(entries.map(entry => {
      const match = /^([a-z0-9-]+)=(passed|failed):(.+)$/.exec(entry);
      if (!match) throw Error(`--record expects <rung>=passed|failed:<what was observed>, got ${entry}`);
      return [match[1]!, { state: match[2] as "passed" | "failed", reason: `recorded: ${match[3]}` }] as const;
    }));
    const results = options.run === "true" ? (await runRungs(repo, applicable)).map(({ output, ...rest }) => {
      const record = recorded.get(rest.name);
      const procedure = applicable.find(rung => rung.name === rest.name)?.procedure !== undefined;
      return { ...rest, ...(record && procedure ? record : {}), output_tail: output?.slice(-2000) };
    }) : [];
    // After a merge the checks must have run at that merge itself: results from any other checkout
    // (a later repair on the default branch, say) block rather than stand in for it.
    const head = execFileSync("git", ["rev-parse", "--verify", `${options.merge ?? "HEAD"}^{commit}`], { cwd: repo }).toString().trim();
    const verdict = options.run === "true" ? mayAdvance(results, { head, declared, allowances: options.allow ? options.allow.split(",") : [] })
      : { advance: !declared, lookup: declared ? "rungs" : "agents-md", blocking: applicable.map(r => r.name) };
    // Every declared rung is reported; one held back for the completion stage, or whose path condition does
    // not hold, is listed as not run with that reason, and takes no part in the verdict above.
    const report = options.run === "true" ? settings.verification_rungs.map(rung => results.find(result => result.name === rung.name) ?? {
      name: rung.name, state: "not run" as const, commit: head,
      reason: deferred.includes(rung.name) ? "it runs at the completion stage only"
        : `its path condition does not hold for this feature (${rung.when === "always" ? "always" : rung.when.paths.join(", ")})` }) : [];
    console.log(JSON.stringify({ declared, stage, range: delta.range, paths: delta.paths, applicable: applicable.map(r => r.name), deferred, results: report, ...verdict }));
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
    // The reviewer reads every routed page from the cache and may not be able to fetch one itself.
    const pages = cacheReviewPages({ repo, commit, revision: need(options, "docs-revision"), binary: need(options, "binary"), pluginPin: need(options, "plugin-pin") });
    if (pages.missing.length) {
      console.log(JSON.stringify({ role: route.role, status: "pending", reason: `convention pages the reviewer reads could not be cached: ${pages.missing.join(", ")} (${pages.reason})` }));
      return 3;
    }
    const prompt = reviewPrompt({ repository: kind === "spec" ? "the current directory, a read-only export of the commit" : "the current directory, a private clone of the reviewed commit",
      document, commit, kind, docsRevision: need(options, "docs-revision"), binary: need(options, "binary"), pluginPin: need(options, "plugin-pin"),
      ...(kind === "spec" ? { scope: reviewScope(repo, document, commit) } : {}) }, loopContext(policy));
    const outcome = await runReviewRoute({ repo, commit, kind, document, route: { model: route.model!, argv: route.argv, ...(route.model_attestation ? { model_attestation: route.model_attestation } : {}) }, prompt,
      scratch: policy.review_scratch, timeoutMs: options["timeout-ms"] ? Number(options["timeout-ms"]) : undefined });
    console.log(JSON.stringify({ role: route.role, ...outcome }));
    return outcome.status === "ready" ? 0 : 3;
  }
  throw Error(`unknown command ${command ?? ""}; use route, context, rungs, ci, skip, delivery, isolation, claim, review or review-scope`);
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(code => process.exit(code), error => {
    console.log(JSON.stringify({ status: "error", reason: (error as Error).message }));
    process.exit(2);
  });
}
