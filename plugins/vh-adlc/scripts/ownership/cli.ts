import { enter, initialize, type Result } from "./entry";

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
  if (command === "enter") {
    return enter({ repo: input.repo, client: input.client, issue: input.issue, spec: input.spec, branch: input.branch,
      noPush: input["no-push"] === "true", localDraft: input["local-draft"] === "true" });
  }
  throw Error("use initialize or enter");
}

if (import.meta.main) {
  let result: Result;
  try { result = main(process.argv.slice(2)); }
  catch (error) { result = { status: "held", reason: error instanceof Error ? error.message : "reservation command failed" }; }
  console.log(JSON.stringify(result));
  process.exitCode = result.status === "held" ? 3 : 0;
}
