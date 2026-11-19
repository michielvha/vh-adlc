import { enter, initialize, type EntryRequest, type Result } from "./entry";
import { handoff, status } from "./handoff";
import { updateAliases } from "./issue-link";

function options(argv: string[]): Record<string, string> {
  const found: Record<string, string> = Object.create(null);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined || Object.hasOwn(found, key.slice(2))) throw Error("expected distinct --flag value pairs");
    found[key.slice(2)] = value;
  }
  return found;
}

function main(argv: string[]): Result {
  const [command, ...args] = argv;
  const input = options(args);
  if (!input.repo) throw Error("--repo is required");
  if (command === "initialize") {
    return initialize(input.repo, input.approved === "true", input.operation ?? "");
  }
  const request: EntryRequest = { repo: input.repo, client: input.client, issue: input.issue, spec: input.spec, branch: input.branch,
    noPush: input["no-push"] === "true", localDraft: input["local-draft"] === "true" };
  if (command === "enter") return enter(request);
  if (command === "status") return status(request);
  if (command === "handoff") return handoff({ ...request, approved: input.approved === "true", stopped: input.stopped === "true",
    preserved: input.preserved === "true", expected: input["expected-operation"] ?? "", operation: input.operation ?? "" });
  if (command === "link" || command === "issue-pending" || command === "issue-recover" || command === "resolve-alias") {
    const alias = input["alias-issue"] || input["alias-spec"] ? { issue: input["alias-issue"], spec: input["alias-spec"] } : undefined;
    return updateAliases(command, { ...request, alias, operation: input.operation ?? "", preview: input.preview,
      confirmed: input.confirmed === "true", notCreated: input["not-created"] === "true", conflict: input.conflict, choose: input.choose,
      approved: input.approved === "true", stopped: input.stopped === "true", preserved: input.preserved === "true" });
  }
  throw Error("use initialize, status, enter, handoff, link, resolve-alias, issue-pending or issue-recover");
}

if (import.meta.main) {
  let result: Result;
  try { result = main(process.argv.slice(2)); }
  catch (error) { result = { status: "held", reason: error instanceof Error ? error.message : "reservation command failed" }; }
  console.log(JSON.stringify(result));
  process.exitCode = result.status === "held" ? 3 : 0;
}
