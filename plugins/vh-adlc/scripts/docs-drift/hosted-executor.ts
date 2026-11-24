import type { RepositoryReader } from "../github-read";
import { parseHostedExecutor, type HostedExecutor } from "./journal";
import { SetupRequired, type Settings } from "./settings";
import type { PublicationIdentity } from "./transport";

/** The selected production profile determines whether Actions attribution is required. */
export function selectHostedExecutor(entry: string, environment: Record<string, string | undefined>): HostedExecutor | undefined {
  if (entry !== "hosted") {
    if (environment.GITHUB_ACTIONS === "true") throw new SetupRequired("Actions production effects require the hosted profile");
    return undefined;
  }
  const selectors = [environment.GITHUB_RUN_ID, environment.GITHUB_RUN_ATTEMPT];
  if (environment.GITHUB_ACTIONS !== "true" || selectors.some(value => typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)
    || !Number.isSafeInteger(Number(value))))
    throw new SetupRequired("Hosted production requires GitHub Actions run selectors");
  return parseHostedExecutor({ run_id: Number(selectors[0]), run_attempt: Number(selectors[1]) });
}

/** Resolve selectors through the existing authenticated reader before sealing an executing plan. */
export function readHostedExecutor(options: {
  entry: string; executor: HostedExecutor; settings: Settings; source: string;
  identity: PublicationIdentity; reader: Pick<RepositoryReader, "run">;
}): HostedExecutor {
  const { settings, source, identity } = options, executor = parseHostedExecutor(options.executor);
  if (options.entry !== "hosted") throw Error("Hosted executor requires the hosted profile");
  if (settings.reports.workflow_id === null) throw new SetupRequired("Configure reports.workflow_id before hosted production");
  const run = options.reader.run(executor.run_id, executor.run_attempt);
  const paths = [settings.reports.workflow_path, settings.reports.workflow_path + "@" + settings.default_branch,
    settings.reports.workflow_path + "@refs/heads/" + settings.default_branch, settings.reports.workflow_path + "@" + source];
  if (identity.repository.toLowerCase() !== settings.repository || identity.default_branch !== settings.default_branch
    || run.id !== executor.run_id || run.run_attempt !== executor.run_attempt || run.status !== "in_progress"
    || !["schedule", "workflow_dispatch"].includes(run.event) || run.workflow_id !== settings.reports.workflow_id || !paths.includes(run.path)
    || run.head_sha !== source || run.head_branch !== settings.default_branch || run.repository.id !== identity.repository_id
    || run.repository.full_name.toLowerCase() !== settings.repository || run.head_repository?.id !== identity.repository_id
    || run.head_repository.full_name.toLowerCase() !== settings.repository)
    throw Error("Hosted production native run identity changed or is inactive");
  return executor;
}
