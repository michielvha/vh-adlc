import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { digest, hash } from "./snapshot";

type Effects = Record<string, string[]>;
type Bindings = { agents_blob: string; settings_blob: string; procedure_blob: string; parity_blob: string; effects_digest: string };
export type AdoptionExpected = { shared_repository: string; reviewed_shared_commit: string; published_source_commit: string; consumer_repository: string;
  consumer_commit: string; version: string; payload_digest: string; review_model: string; policy: Bindings };
const hex = (value: unknown, length: number) => typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const commit = (value: unknown) => hex(value, 40) || hex(value, 64);
export function effectsDigest(effects: Effects) {
  if (!effects || Object.keys(effects).sort().join(",") !== "fix,full,reverify,status" || Object.values(effects).some(values => !Array.isArray(values) || values.some(value => typeof value !== "string") || new Set(values).size !== values.length)) throw Error("Invalid mode effects");
  return digest(Object.fromEntries(Object.entries(effects).map(([mode, values]) => [mode, [...values].sort()])));
}
/** Artifact-bound operator attestations only. Never executes receipt commands or grants an effect. */
export function adoptionPreflight(input: { expected: AdoptionExpected; receipt?: unknown; artifact_root: string }) {
  const failures: string[] = [], fail = (reason: string) => { failures.push(reason); };
  const limit = "Receipts are operator attestations backed by unchanged artifacts; they do not independently prove publication, dispatch, semantic truth or merge authority.";
  try {
    const expected = input.expected, receipt = input.receipt as any;
    if (!expected || !commit(expected.reviewed_shared_commit) || !commit(expected.published_source_commit) || !commit(expected.consumer_commit) || !hex(expected.payload_digest, 64) ||
        !/^\d+\.\d+\.\d+$/.test(expected.version) || !expected.review_model || ![expected.shared_repository, expected.consumer_repository].every(value => /^[\w-]+\/[\w.-]+$/.test(value)) ||
        !expected.policy || ![expected.policy.agents_blob, expected.policy.settings_blob, expected.policy.procedure_blob, expected.policy.parity_blob].every(commit) || !hex(expected.policy.effects_digest, 64)) throw Error("expected published target absent or invalid");
    if (!receipt || receipt.schema_version !== 1 || receipt.kind !== "published-marketplace" || receipt.operation !== "vh-adlc-audit" || typeof receipt.recorded_at !== "string" || !Number.isFinite(Date.parse(receipt.recorded_at))) throw Error("published-marketplace evidence missing");
    for (const key of ["shared_repository", "reviewed_shared_commit", "published_source_commit", "consumer_repository", "consumer_commit", "version", "payload_digest", "review_model"] as const) if (receipt[key] !== expected[key]) fail(`target-mismatch:${key}`);
    if (digest(receipt.policy) !== digest(expected.policy)) fail("policy-bindings");
    const root = realpathSync(input.artifact_root), info = lstatSync(input.artifact_root);
    if (info.isSymbolicLink() || !info.isDirectory() || info.mode & 0o077 || process.getuid && info.uid !== process.getuid()) throw Error("unsafe artifact root");
    const artifact = (value: any, label: string): string | null => {
      try {
        if (!value || typeof value.path !== "string" || !hex(value.sha256, 64) || value.path.split(/[\\/]/).some((part: string) => !part || [".", ".."].includes(part)) || value.path.includes("\\") || value.path.includes("\0")) throw Error();
        let path = root; const parts = value.path.split("/");
        for (const [index, part] of parts.entries()) { path = join(path, part); const stat = lstatSync(path);
          if (stat.isSymbolicLink() || stat.mode & 0o077 || process.getuid && stat.uid !== process.getuid() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) throw Error(); }
        const bytes = readFileSync(path); if (hash(bytes) !== value.sha256) throw Error(); return bytes.toString();
      } catch { fail(`artifact-missing-or-changed:${label}`); return null; }
    };
    const command = (value: any, label: string) => {
      if (!value || value.exit_code !== 0 || value.timed_out !== false || !Array.isArray(value.argv) || !value.argv.length || value.argv.some((arg: unknown) => typeof arg !== "string" || !arg || arg.includes("\0"))) { fail(`native-command:${label}`); return null; }
      return artifact(value.transcript, label);
    };
    const review = receipt.paired_review;
    if (!review || review.shared_commit !== expected.reviewed_shared_commit || review.consumer_commit !== expected.consumer_commit || review.model !== expected.review_model || review.result !== "NO FINDINGS") fail("paired-review-target-model-or-result");
    else { const text = artifact(review.artifact, "paired-review"); if (!text || text.split(/\r?\n/)[0] !== `MODEL: ${expected.review_model}` || text.slice(text.indexOf("\n") + 1).trim() !== "NO FINDINGS") fail("paired-review-bytes"); }
    const policy = receipt.candidate_policy;
    if (!policy || policy.kind !== "installed-candidate-policy" || policy.shared_commit !== expected.published_source_commit || policy.consumer_commit !== expected.consumer_commit || policy.payload_digest !== expected.payload_digest || digest(policy.bindings) !== digest(expected.policy) || policy.valid !== true || policy.allowed !== false || policy.adopted !== false) fail("installed-candidate-policy");
    else {
      const text = command(policy.command, "candidate-policy");
      if (!policy.command?.argv?.some((arg: string) => /(?:^|\/)scripts\/audit\/cli\.ts$/.test(arg)) || !policy.command.argv.includes("policy-candidate") || policy.command.argv[policy.command.argv.indexOf("--commit") + 1] !== expected.consumer_commit) fail("candidate-policy-command");
      try { const parsed = JSON.parse(text ?? "null"); if (parsed?.valid !== true || parsed?.allowed !== false || parsed?.adopted !== false || parsed?.consumer_commit !== expected.consumer_commit || digest(parsed?.bindings) !== digest(expected.policy) || effectsDigest(parsed.declaration.effects) !== expected.policy.effects_digest) fail("candidate-policy-effects"); } catch { fail("candidate-policy-effects"); }
    }
    if (!Array.isArray(receipt.hosts) || receipt.hosts.length !== 2 || new Set(receipt.hosts.map((host: any) => host.host)).size !== 2) throw Error("both distinct native hosts required");
    for (const name of ["codex-cli", "claude-cli"]) {
      const host = receipt.hosts.find((row: any) => row.host === name);
      if (!host) { fail(`missing-host:${name}`); continue; }
      if (host.source !== "published-marketplace" || host.catalog_repository !== expected.shared_repository || host.published_source_commit !== expected.published_source_commit || host.version !== expected.version || host.payload_digest !== expected.payload_digest || host.isolated_profile !== true || host.authentication_copied !== false) fail(`installed-source-or-payload:${name}`);
      for (const stage of ["fresh_install", "upgrade", "reinstall"]) command(host[stage], `${name}:${stage}`);
      if (host.discovery?.operation !== "vh-adlc-audit") fail(`discovery:${name}`); else command(host.discovery.command, `${name}:discovery`);
      if (!Array.isArray(host.helpers) || host.helpers.length !== 3 || new Set(host.helpers.map((row: any) => row.stage)).size !== 3) { fail(`helpers:${name}`); continue; }
      for (const stage of ["settings", "inventory", "report"]) {
        const helper = host.helpers.find((row: any) => row.stage === stage);
        if (!helper || !hex(helper.input_before_digest, 64) || helper.input_before_digest !== helper.input_after_digest || !hex(helper.index_before_digest, 64) || helper.index_before_digest !== helper.index_after_digest) { fail(`helper-preservation:${name}:${stage}`); continue; }
        command(helper.command, `${name}:${stage}`);
        if (!helper.command?.argv?.some((arg: string) => /(?:^|\/)scripts\/audit\/cli\.ts$/.test(arg)) || !helper.command.argv.includes(stage)) fail(`helper-command-binding:${name}:${stage}`);
      }
    }
  } catch (error) {
    const known = ["expected published target absent or invalid", "published-marketplace evidence missing", "unsafe artifact root", "both distinct native hosts required"];
    fail(error instanceof Error && known.includes(error.message) ? error.message : "adoption evidence unavailable or malformed");
  }
  return { pass: !failures.length, failures, limit };
}
