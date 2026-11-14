import { realpathSync } from "node:fs";
import { effectiveLabels, loadSettings, origin } from "../triage/settings";
import type { LabelsGitHub } from "./github";
import { digest } from "./plan";

export type FilingRequest = {
  operation: "investigate" | "spec";
  type: string;
  verdict?: "act now" | "track" | "reject";
  waiting_on?: "prerequisite" | "decision";
  title: string;
  body: string;
};
export type Preview = {
  schema_version: 1; host: string; repository: string; actor: string;
  operation: FilingRequest["operation"]; type: string; verdict: string | null; waiting_on: string | null;
  title: string; body: string; labels: string[]; missing: string[]; next: string | null;
};

const PLAN_STEP = "Run `bun <plugin>/scripts/labels/cli.ts plan --repo <checkout> --output <new file>`, have the owner approve its exact digest and apply it, then file again.";

/** The standard state label a request names (references/issues.md), or null for none. */
export function stateFor(request: FilingRequest): string | null {
  if (request.operation === "spec") {
    if (request.verdict !== undefined || request.waiting_on !== undefined) throw new Error("spec files an issue with a type label only");
    return null;
  }
  if (request.verdict === "act now" && request.waiting_on === undefined) return "ready";
  if (request.verdict === "reject" && request.waiting_on === undefined) return null;
  if (request.verdict === "track" && request.waiting_on === "prerequisite") return "blocked";
  if (request.verdict === "track" && request.waiting_on === "decision") return "needs-decision";
  throw new Error("investigate needs a verdict: act now, track with --waiting-on prerequisite or decision, or reject");
}

/** What would be filed, with the labels the owner must see first; reads only. */
export function filingPreview(root: string, gh: LabelsGitHub, request: FilingRequest): { preview: Preview; text: string; digest: string } {
  root = realpathSync(root);
  if (!request.title.trim() || !request.body.trim()) throw new Error("an issue needs a title and a body");
  const identity = origin(root);
  if (gh.host.toLowerCase() !== identity.hostname) throw new Error("GitHub host differs from the checkout's origin");
  const labels = effectiveLabels(loadSettings(root));
  const type = labels.find((label) => label.kind === "type" && label.standard === request.type);
  if (!type) throw new Error(`type must be one of the standard type labels: ${labels.filter((label) => label.kind === "type").map((label) => label.standard).join(", ")}`);
  const state = stateFor(request);
  const wanted = [type, ...labels.filter((label) => label.standard === state)];
  const actor = gh.actor(), existing = gh.labels(identity.repository);
  const resolved = wanted.map((label) => existing.find((item) => item.name.toLowerCase() === label.name.toLowerCase())?.name ?? null);
  const missing = wanted.filter((_, index) => resolved[index] === null).map((label) => label.name);
  const preview: Preview = {
    schema_version: 1, host: identity.hostname, repository: identity.repository, actor,
    operation: request.operation, type: request.type, verdict: request.verdict ?? null, waiting_on: request.waiting_on ?? null,
    title: request.title, body: request.body,
    labels: wanted.map((label, index) => resolved[index] ?? label.name), missing, next: missing.length ? PLAN_STEP : null,
  };
  const text = JSON.stringify(preview, null, 2) + "\n";
  return { preview, text, digest: digest(text) };
}

/** Create the approved issue; refuses when anything in the preview changed or a label is missing. */
export function fileIssue(root: string, gh: LabelsGitHub, text: string, approvedDigest: string): { number: number; url: string } {
  if (!/^[0-9a-f]{64}$/.test(approvedDigest) || digest(text) !== approvedDigest) throw new Error("exact preview approval digest is missing or changed");
  const approved = JSON.parse(text) as Preview;
  if (approved.missing.length) throw new Error(`file nothing: missing labels ${approved.missing.join(", ")}. ${PLAN_STEP}`);
  const request: FilingRequest = { operation: approved.operation, type: approved.type, title: approved.title, body: approved.body,
    ...(approved.verdict === null ? {} : { verdict: approved.verdict as FilingRequest["verdict"] }),
    ...(approved.waiting_on === null ? {} : { waiting_on: approved.waiting_on as FilingRequest["waiting_on"] }) };
  if (filingPreview(root, gh, request).text !== text) throw new Error("the repository, account or labels changed since this preview was approved; preview again");
  return gh.createIssue(approved.repository, { title: approved.title, body: approved.body, labels: approved.labels });
}
