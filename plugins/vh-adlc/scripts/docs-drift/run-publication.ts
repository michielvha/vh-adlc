import { dirname, join, relative } from "node:path";
import { readBoundArtifact } from "./evidence-input";
import { parseActionManifest } from "./manifests";
import { exactRecord } from "./publication-decisions";
import { publishPublication, resumePublication } from "./publication-controller";
import { decodeUTF8, protocolPath } from "./protocol";
import { latestRunArtifact, originalRunContext, type RunDirectory } from "./run-directory";
import { recordRunApproval } from "./run-approval";
import { loadCommittedSettings } from "./settings";
import { readNativeCredential } from "./transport";
import { selectHostedExecutor } from "./hosted-executor";

/** Bind the owner's actual approval to the already displayed exact manifest before the existing controller executes. */
export async function runPublication(options: { repo: string; run: RunDirectory }) {
  const { repo } = options, source = options.run.manifest.source_commit;
  originalRunContext(options.run);
  const hostedExecutor = selectHostedExecutor(options.run.manifest.entry, process.env);
  let run = options.run;
  const read = (name: string) => {
    const reference = latestRunArtifact(run, name);
    if (!reference) throw Error("Missing original publication input " + name);
    return { reference, bytes: readBoundArtifact({ source_repo: repo, artifact_root: run.directory, reference }) };
  };
  const payload: unknown = JSON.parse(decodeUTF8(read("candidate").bytes));
  const hasResolution = payload !== null && typeof payload === "object" && Object.hasOwn(payload, "resolution_record");
  const candidate = exactRecord(payload, ["source_commit", "candidate_commit", "checkout", ...(hasResolution ? ["resolution_record"] : [])], "Original candidate fields changed");
  if (candidate.source_commit !== source || typeof candidate.candidate_commit !== "string" || typeof candidate.checkout !== "string")
    throw Error("Original committed candidate required");
  protocolPath(relative(run.directory, candidate.checkout));
  let resolutionRecord: { path: string; sha256: string } | undefined;
  if (hasResolution) {
    const record = exactRecord(candidate.resolution_record, ["path", "sha256"], "Original resolution reference required");
    if (typeof record.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(record.sha256)) throw Error("Original resolution digest required");
    resolutionRecord = { path: protocolPath(record.path), sha256: record.sha256 };
  }
  const manifest = parseActionManifest(JSON.parse(decodeUTF8(read("reviewed_plan").bytes)));
  if (manifest.bindings.source_commit !== source || manifest.bindings.candidate_commit !== candidate.candidate_commit)
    throw Error("Original reviewed candidate changed");
  const settings = loadCommittedSettings(repo, source).settings;
  const journal = latestRunArtifact(run, "journal");
  run = recordRunApproval({ repo, run, manifest, command: "publish" });
  const credential = await readNativeCredential({ hostname: settings.hostname, cwd: repo });
  const common = { repo, source, artifact_root: run.directory, owner: run.manifest.id, run: run.manifest.id,
    ...(hostedExecutor === undefined ? {} : { hosted_executor: hostedExecutor }),
    candidate_repo: candidate.checkout, candidate: candidate.candidate_commit, selection: JSON.parse(decodeUTF8(read("selection").bytes)) as unknown,
    source_verification: read("source_verification").reference, candidate_verification: read("candidate_verification").reference,
    decisions: read("decisions").reference, worker_capture: read("worker_capture").reference, reviewer_capture: read("reviewer_capture").reference,
    authority: read("approval").reference, credential, cache_directory: run.directory, entry: run.manifest.entry, resolution_record: resolutionRecord,
    launcher_path: join(import.meta.dir, "cli.ts"), settings_path: join(repo, ".vh-adlc/docs-drift.yaml") };
  return journal ? resumePublication({ ...common, journal_directory: dirname(join(run.directory, journal.path)) }, run)
    : publishPublication(common, run);
}
