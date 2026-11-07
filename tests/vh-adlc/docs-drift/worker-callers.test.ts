import { expect, test } from "bun:test";
import { verifyWorkerCallers } from "../../../plugins/vh-adlc/scripts/docs-drift/worker-callers";
import { canonicalJSON, sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

function callers(productionDraft = false) {
  const scheduled = {
    name: "Synthetic docs-drift worker",
    on: { schedule: [{ cron: "0 6 * * *" }], workflow_dispatch: null } as Record<string, unknown>,
    permissions: { contents: "write", "pull-requests": "write", actions: "read" },
    jobs: { worker: { uses: "./.github/workflows/docs-drift-worker.yml",
      with: { component_pin: ".vh-adlc/components/fixture.yaml", fixture: "consumer", pr_draft: productionDraft } as Record<string, string | number | boolean>,
      secrets: { PROVIDER_TOKEN: "${{ secrets.PROVIDER_TOKEN }}" } } },
  };
  const trial = structuredClone(scheduled);
  trial.on = { workflow_dispatch: null }; trial.jobs.worker.with.fixture = "synthetic"; trial.jobs.worker.with.pr_draft = true;
  return { trial, scheduled };
}
type Callers = ReturnType<typeof callers>;
function check(value: Callers, productionDraft = false) {
  return verifyWorkerCallers({ trial: canonicalJSON(value.trial), scheduled: canonicalJSON(value.scheduled),
    worker_path: ".github/workflows/docs-drift-worker.yml", component_pin: ".vh-adlc/components/fixture.yaml", production_pr_draft: productionDraft,
    input_differences: { fixture: { trial: "synthetic", scheduled: "consumer" } } });
}

test.each([false, true])("both callers retain the exact shared contract with production draft=%s", draft => {
  const value = callers(draft), proof = check(value, draft);
  expect(proof.trial_sha256).toBe(sha256(canonicalJSON(value.trial)));
  expect(proof.scheduled_sha256).toBe(sha256(canonicalJSON(value.scheduled)));
  expect(proof.worker_path).toBe(".github/workflows/docs-drift-worker.yml");
  expect(proof.contract_sha256).toMatch(/^[a-f0-9]{64}$/u);
  const before = proof.contract_sha256;
  value.trial.permissions.contents = "read"; value.scheduled.permissions.contents = "read";
  expect(check(value, draft).contract_sha256).not.toBe(before);
});

const mismatches: Array<[string, (value: Callers) => void]> = [
  ["worker selection", value => { value.trial.jobs.worker.uses = "./.github/workflows/other.yml"; }],
  ["both worker selections", value => { value.trial.jobs.worker.uses = value.scheduled.jobs.worker.uses = "./.github/workflows/other.yml"; }],
  ["permissions", value => { value.trial.permissions.actions = "none"; }],
  ["extra job", value => { Object.assign(value.trial.jobs, { extra: value.trial.jobs.worker }); }],
  ["extra identical jobs", value => { Object.assign(value.trial.jobs, { extra: value.trial.jobs.worker }); Object.assign(value.scheduled.jobs, { extra: value.scheduled.jobs.worker }); }],
  ["extra steps", value => { Object.assign(value.trial.jobs.worker, { steps: [{ run: "unexpected" }] }); }],
  ["extra identical steps", value => { for (const caller of [value.trial, value.scheduled]) Object.assign(caller.jobs.worker, { steps: [{ run: "unexpected" }] }); }],
  ["ambient secrets", value => { Object.assign(value.trial.jobs.worker, { secrets: "inherit" }); }],
  ["changed secret names", value => { value.trial.jobs.worker.secrets.PROVIDER_TOKEN = "${{ secrets.OTHER_TOKEN }}"; }],
  ["expression secret source", value => { for (const caller of [value.trial, value.scheduled]) caller.jobs.worker.secrets.PROVIDER_TOKEN = "${{ inputs.token }}"; }],
  ["changed invocation", value => { value.trial.jobs.worker.with.component_pin = ".vh-adlc/components/other.yaml"; }],
  ["unbound extra input", value => { value.trial.jobs.worker.with.unbound = "extra"; }],
  ["wrong declared fixture", value => { value.trial.jobs.worker.with.fixture = "real-corpus"; }],
  ["expression fixture", value => { value.trial.jobs.worker.with.fixture = "${{ inputs.fixture }}"; }],
  ["trial ready", value => { value.trial.jobs.worker.with.pr_draft = false; }],
  ["string draft", value => { value.trial.jobs.worker.with.pr_draft = "true"; }],
  ["production draft", value => { value.scheduled.jobs.worker.with.pr_draft = true; }],
  ["trial cron", value => { value.trial.on.schedule = [{ cron: "0 6 * * *" }]; }],
  ["trial push trigger", value => { value.trial.on = { push: null }; }],
  ["absent scheduled trigger", value => { value.scheduled.on = { workflow_dispatch: null }; }],
  ["changed environment", value => { Object.assign(value.trial, { env: { UNEXPECTED: "different" } }); }],
  ["unknown identical job field", value => { for (const caller of [value.trial, value.scheduled]) Object.assign(caller.jobs.worker, { unknown: "field" }); }],
];
test.each(mismatches)("caller mismatch fails closed (%s)", (_name, change) => {
  const value = callers(); change(value); expect(() => check(value)).toThrow();
});

test("declared input differences must be literal, present and independently bound", () => {
  const value = callers(), common = { trial: canonicalJSON(value.trial), scheduled: canonicalJSON(value.scheduled),
    worker_path: ".github/workflows/docs-drift-worker.yml", component_pin: ".vh-adlc/components/fixture.yaml", production_pr_draft: false };
  const invalid: Array<Parameters<typeof verifyWorkerCallers>[0]["input_differences"]> = [
    {}, { missing: { trial: "synthetic", scheduled: "consumer" } },
    { pr_draft: { trial: true, scheduled: false } },
    { fixture: { trial: "${{ inputs.fixture }}", scheduled: "consumer" } },
  ];
  for (const input_differences of invalid) expect(() => verifyWorkerCallers({ ...common, input_differences })).toThrow();
  expect(() => verifyWorkerCallers({ ...common, worker_path: "../foreign.yml", input_differences: { fixture: { trial: "synthetic", scheduled: "consumer" } } })).toThrow();
});

test("duplicate YAML policy keys never become a caller proof", () => {
  const value = callers();
  expect(() => verifyWorkerCallers({ trial: Buffer.from("on: workflow_dispatch\non: schedule\njobs: {}\n"),
    scheduled: canonicalJSON(value.scheduled), worker_path: ".github/workflows/docs-drift-worker.yml", component_pin: ".vh-adlc/components/fixture.yaml", production_pr_draft: false,
    input_differences: { fixture: { trial: "synthetic", scheduled: "consumer" } } })).toThrow();
});


test("declaring a component pin as a fixture difference cannot bypass exact shared runtime selection", () => {
  const value = callers(); value.trial.jobs.worker.with.component_pin = ".vh-adlc/components/candidate.yaml";
  expect(() => verifyWorkerCallers({ trial: canonicalJSON(value.trial), scheduled: canonicalJSON(value.scheduled),
    worker_path: ".github/workflows/docs-drift-worker.yml", component_pin: ".vh-adlc/components/fixture.yaml", production_pr_draft: false,
    input_differences: { fixture: { trial: "synthetic", scheduled: "consumer" },
      component_pin: { trial: ".vh-adlc/components/candidate.yaml", scheduled: ".vh-adlc/components/fixture.yaml" } } })).toThrow();
});
