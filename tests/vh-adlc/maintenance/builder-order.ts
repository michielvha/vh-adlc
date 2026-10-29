import { resolve } from "node:path";
// Observe application through either a commit/merge or a fresh ref/worktree at the selected bot.
export function builderOrder(rows: any[], sourceRoot: string, sourceTarget: string, bump: any, bot: string) {
  const build = rows.findIndex(row => row.kind === "source-build" && row.cwd === sourceRoot && row.head === sourceTarget && row.exit_code === 0 && row.argv.includes(bump.builder_receipt));
  const application = rows.findIndex(row => {
    if (row.kind !== "git-result" || row.exit_code !== 0) return false;
    if (row.git_cwd === bump.root && (["merge", "cherry-pick"].includes(row.operation) && row.args.includes(bot) || row.operation === "commit" && row.staged.includes("deps/builder.version.json"))) return true;
    if (row.operation === "worktree" && row.args.includes("add") && row.args.some(arg => !arg.startsWith("-") && resolve(row.git_cwd ?? row.cwd, arg) === bump.root) && row.args.includes(bot)) return true;
    return ["branch", "update-ref"].includes(row.operation) && row.args.includes(bot) && row.args.some(arg => arg === bump.ref || arg === `refs/heads/${bump.ref}`);
  });
  return { pass: build >= 0 && application > build, build_trace_index: build, application_trace_index: application };
}
