import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { digest } from "./journal";
import { repositoryPath } from "./authority";

type Artifact = { path: string; sha256: string };
type Command = { argv: string[]; exit_code: number; transcript: Artifact };
export type AdoptionExpected = { shared_repository: string; reviewed_shared_commit: string; published_source_commit: string; consumer_repository: string;
  consumer_commit: string; version: string; payload_digest: string; review_model?: string };
const hash = (input: unknown, length: number) => typeof input === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(input);
const commit = (input: unknown) => hash(input, 40) || hash(input, 64);
export function adoptionPreflight(input: { expected: AdoptionExpected; receipt?: unknown; artifact_root: string }) {
  const failures: string[] = [], limit = "Receipts are operator attestations backed by unchanged local artifacts; this check grants no merge authority and does not prove a dispatch or publication by itself.";
  const fail = (reason: string) => { failures.push(reason); };
  try {
    const expected = input.expected, receipt = input.receipt as any;
    if (!expected || !commit(expected.reviewed_shared_commit) || !commit(expected.published_source_commit) || !commit(expected.consumer_commit) || !hash(expected.payload_digest, 64) || !/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(expected.version) ||
      !/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(expected.shared_repository) || !/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(expected.consumer_repository)) throw Error("expected published target absent or invalid");
    if (!receipt || receipt.schema_version !== 1 || receipt.kind !== "published-marketplace" || receipt.operation !== "vh-adlc-maintenance" || typeof receipt.recorded_at !== "string" || !Number.isFinite(Date.parse(receipt.recorded_at))) throw Error("published-marketplace evidence missing");
    for (const key of ["shared_repository", "reviewed_shared_commit", "published_source_commit", "consumer_repository", "consumer_commit", "version", "payload_digest"] as const) if (receipt[key] !== expected[key]) fail(`target-mismatch:${key}`);
    const root = realpathSync(input.artifact_root);
    if (lstatSync(input.artifact_root).isSymbolicLink()) throw Error("unsafe artifact root");
    const artifact = (value: Artifact, label: string) => {
      try {
        repositoryPath(value.path); if (!hash(value.sha256, 64)) throw Error();
        let current = root; const parts = value.path.split("/");
        for (const [index, part] of parts.entries()) { current = join(current, part); const info = lstatSync(current); if (info.isSymbolicLink() || (index === parts.length - 1 ? !info.isFile() : !info.isDirectory())) throw Error(); }
        if (digest(readFileSync(current)) !== value.sha256) throw Error();
      } catch { fail(`artifact-missing-or-changed:${label}`); }
    };
    const command = (value: Command, label: string) => {
      if (!value || value.exit_code !== 0 || !Array.isArray(value.argv) || !value.argv.length || value.argv.some(arg => typeof arg !== "string" || !arg || arg.includes("\0"))) { fail(`native-command:${label}`); return; }
      artifact(value.transcript, label);
    };
    const review = receipt.paired_review;
    if (!review || review.shared_commit !== expected.reviewed_shared_commit || review.consumer_commit !== expected.consumer_commit || review.result !== "no-blocking-findings" || typeof review.model !== "string" || !review.model || expected.review_model && review.model !== expected.review_model) fail("paired-review-target-model-or-result");
    else artifact(review.artifact, "paired-review");
    if (!Array.isArray(receipt.hosts) || receipt.hosts.length !== 2 || new Set(receipt.hosts.map((row: any) => row.host)).size !== 2) throw Error("both distinct native hosts required");
    for (const name of ["codex-cli", "claude-cli"]) {
      const host = receipt.hosts.find((row: any) => row.host === name);
      if (!host) { fail(`missing-host:${name}`); continue; }
      if (host.source !== "published-marketplace" || host.catalog_repository !== expected.shared_repository || host.published_source_commit !== expected.published_source_commit || host.version !== expected.version || host.payload_digest !== expected.payload_digest || host.isolated_profile !== true) fail(`installed-source-or-payload:${name}`);
      command(host.install, `${name}:install`);
      if (host.discovery?.operation !== "vh-adlc-maintenance") fail(`discovery:${name}`); else command(host.discovery.command, `${name}:discovery`);
      if (!Array.isArray(host.helpers) || host.helpers.length !== 3 || new Set(host.helpers.map((row: any) => row.stage)).size !== 3) { fail(`helpers:${name}`); continue; }
      for (const stage of ["settings", "collection", "report"]) {
        const helper = host.helpers.find((row: any) => row.stage === stage);
        if (!helper || !hash(helper.input_before_digest, 64) || helper.input_before_digest !== helper.input_after_digest || !hash(helper.index_before_digest, 64) || helper.index_before_digest !== helper.index_after_digest) { fail(`helper-preservation:${name}:${stage}`); continue; }
        command(helper.command, `${name}:${stage}`);
        if (!Array.isArray(helper.command?.argv) || !helper.command.argv.some((arg: string) => /(?:^|\/)scripts\/maintenance\/cli\.ts$/.test(arg)) || !helper.command.argv.includes(stage === "collection" ? "collect" : stage)) fail(`helper-command-binding:${name}:${stage}`);
      }
    }
  } catch (error) {
    const known = ["expected published target absent or invalid", "published-marketplace evidence missing", "unsafe artifact root", "both distinct native hosts required"];
    fail(error instanceof Error && known.includes(error.message) ? error.message : "adoption evidence unavailable or malformed");
  }
  return { pass: failures.length === 0, failures, limit };
}
