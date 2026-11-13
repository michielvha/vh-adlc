import { expect, test } from "bun:test";

const workerPath = ".github/workflows/docs-drift-worker.yml";
const scheduled = Buffer.from(`name: Documentation drift
on:
  schedule:
    - cron: '0 3 * * *'
jobs:
  drift:
    name: Scheduled audit
    uses: ./${workerPath}
`);
const ids = ["collect", "review", "report", "upload", "attention"];
const worker = (change: (steps: Array<{ id: string; name: string; run: string }>) => void = () => {}) => {
  const steps = ids.map(id => ({ id: "docs-drift-" + id, name: "Drift " + id, run: "synthetic-only" }));
  change(steps);
  return Buffer.from(JSON.stringify({ on: { workflow_call: null }, jobs: { report: { name: "Documentation report", "runs-on": "ubuntu-latest", steps } } }));
};

test("history producer step names come from the protected caller and reusable worker", async () => {
  const { readHistoryWorkflowContract } = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-workflow");
  const input = { scheduled, worker: worker(), worker_path: workerPath };
  expect(readHistoryWorkflowContract(input)).toEqual({ job_name: "Scheduled audit / Documentation report",
    attention_step: "Drift attention", required_steps: ids.map(id => "Drift " + id),
    required_jobs: [{ name: "Scheduled audit / Documentation report", steps: ids.map(id => "Drift " + id) }] });
  expect(readHistoryWorkflowContract({ ...input, scheduled: Buffer.from(scheduled.toString().replace("    name: Scheduled audit\n", "")),
    worker: Buffer.from(worker().toString().replace('"name":"Documentation report",', "")) }).job_name).toBe("drift / report");
});

test("history binds a separate credential-free collection job as well as the report job", async () => {
  const { readHistoryWorkflowContract } = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-workflow");
  const parsed = JSON.parse(worker().toString()), collect = parsed.jobs.report.steps.shift();
  parsed.jobs.collect = { name: "Credential-free collection", "runs-on": "ubuntu-latest", steps: [collect] };
  const result = readHistoryWorkflowContract({ scheduled, worker: Buffer.from(JSON.stringify(parsed)), worker_path: workerPath });
  expect(result.required_steps).toEqual(ids.slice(1).map(id => "Drift " + id));
  expect(result.required_jobs).toEqual([{ name: "Scheduled audit / Credential-free collection", steps: ["Drift collect"] },
    { name: "Scheduled audit / Documentation report", steps: ids.slice(1).map(id => "Drift " + id) }]);
});

test.each(["missing", "duplicate-id", "duplicate-name", "expression-name", "second-producer"])("history refuses an ambiguous protected worker contract: %s", async fault => {
  const { readHistoryWorkflowContract } = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-workflow");
  let bytes = worker(steps => {
    if (fault === "missing") steps.pop();
    if (fault === "duplicate-id") steps.push({ ...steps[0], name: "Other collect" });
    if (fault === "duplicate-name") steps.push({ id: "extra", name: steps[0].name, run: "synthetic-only" });
    if (fault === "expression-name") steps[0].name = "${{ inputs.name }}";
  });
  if (fault === "second-producer") {
    const parsed = JSON.parse(bytes.toString()); parsed.jobs.other = structuredClone(parsed.jobs.report); bytes = Buffer.from(JSON.stringify(parsed));
  }
  expect(() => readHistoryWorkflowContract({ scheduled, worker: bytes, worker_path: workerPath })).toThrow("incomplete docs-drift history workflow");
});

test.each(["different-worker", "expression-caller", "second-caller", "not-reusable", "duplicate-yaml-key"])("history refuses an unbound caller or worker: %s", async fault => {
  const { readHistoryWorkflowContract } = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-workflow");
  const caller = fault === "different-worker" ? Buffer.from(scheduled.toString().replace(workerPath, ".github/workflows/other.yml"))
    : fault === "expression-caller" ? Buffer.from(scheduled.toString().replace("Scheduled audit", "${{ inputs.name }}"))
      : fault === "second-caller" ? Buffer.from(scheduled.toString() + "  extra:\n    uses: ./" + workerPath + "\n")
        : fault === "duplicate-yaml-key" ? Buffer.from(scheduled.toString() + "jobs: {}\n") : scheduled;
  const bytes = fault === "not-reusable" ? Buffer.from(worker().toString().replace('"workflow_call":null', '"push":null')) : worker();
  expect(() => readHistoryWorkflowContract({ scheduled: caller, worker: bytes, worker_path: workerPath })).toThrow("incomplete docs-drift history workflow");
});

test.each(["after-attention", "dependent-job", "transitive-dependent-job", "conditional-job", "conditional-step", "ignored-job-failure", "ignored-step-failure"])("history refuses a layout that cannot complete a first-red report: %s", async fault => {
  const { readHistoryWorkflowContract } = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-workflow");
  const parsed = JSON.parse(worker().toString()), job = parsed.jobs.report;
  if (fault === "after-attention") job.steps.push({ name: "Runs too late", run: "synthetic-only" });
  if (["dependent-job", "transitive-dependent-job"].includes(fault)) {
    parsed.jobs.later = { needs: "report", "runs-on": "ubuntu-latest", steps: [{ name: "Late job", run: "synthetic-only" }] };
    if (fault === "transitive-dependent-job") parsed.jobs.last = { needs: ["later"], "runs-on": "ubuntu-latest", steps: [{ name: "Last job", run: "synthetic-only" }] };
  }
  if (fault === "conditional-job") job.if = "${{ inputs.enabled }}";
  if (fault === "conditional-step") job.steps[0].if = "${{ inputs.enabled }}";
  if (fault === "ignored-job-failure") job["continue-on-error"] = true;
  if (fault === "ignored-step-failure") job.steps[0]["continue-on-error"] = true;
  expect(() => readHistoryWorkflowContract({ scheduled, worker: Buffer.from(JSON.stringify(parsed)), worker_path: workerPath })).toThrow("incomplete docs-drift history workflow");
});

test("mandatory diagnostic upload may use always() while attention remains last", async () => {
  const { readHistoryWorkflowContract } = await import("../../../plugins/vh-adlc/scripts/docs-drift/history-workflow");
  const parsed = JSON.parse(worker().toString());
  parsed.jobs.report.if = "${{ always() }}";
  parsed.jobs.report.steps[3].if = "always()";
  expect(readHistoryWorkflowContract({ scheduled, worker: Buffer.from(JSON.stringify(parsed)), worker_path: workerPath }).attention_step).toBe("Drift attention");
});
