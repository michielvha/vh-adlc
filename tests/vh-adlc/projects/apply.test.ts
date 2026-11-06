import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { apply, digest, parsePlan } from "../../../plugins/vh-adlc/scripts/projects/apply";
import { fixture, settings, page, issue, boardStep, itemsStep, repoStep, relationsStep } from "./fixtures";

const item = (value = "todo") => ({ id: "ITEM_1", content: { __typename: "Issue", ...issue() } });
const values = (value: string) => ({ operation: "ItemFields", response: { data: { node: { fieldValues: page([{ optionId: value, field: { id: "F_1" } }]) } } } });
const snapshot = (member = false, value = "todo") => [boardStep(), itemsStep(member ? [item(value)] : []), ...(member ? [values(value)] : []), repoStep("example/one", [issue()]), relationsStep(), repoStep("other/two", [])];
const plan = (operations: unknown[] = [{ kind: "add", issue: issue() }]) => JSON.stringify({ schema_version: 1, complete: true, project: { id: "P_1", url: settings().project }, repositories: settings().repositories, operations });
const update = () => ({ kind: "set", issue: issue(), item: "ITEM_1", field: "F_1", before: "todo", value: "done" });

test("approval is bound to exact bytes and unsupported operations never reach gh", () => {
  const text = plan(), f = fixture([]);
  expect(() => apply(settings(), f.gh, text, "wrong")).toThrow();
  expect(() => apply(settings(), f.gh, text + " ", digest(text))).toThrow();
  for (const operations of [[{ kind: "close", issue: issue() }], [{ kind: "add", issue: issue("OTHER", "foreign/repo") }], [{ ...update(), value: "foreign-option" }]]) expect(() => parsePlan(settings(), plan(operations))).toThrow();
  expect(existsSync(f.state + ".calls")).toBe(false);
});
test("approved issue add is verified and a repeated batch does not write again", () => {
  const text = plan(), f = fixture([...snapshot(), { operation: "AddIssue", response: { data: { addProjectV2ItemById: { item: { id: "ITEM_1" } } } } }, ...snapshot(true), ...snapshot(true)]);
  expect(apply(settings(), f.gh, text, digest(text))).toMatchObject({ complete: true, outcomes: [{ status: "succeeded" }] });
  expect(apply(settings(), f.gh, text, digest(text))).toMatchObject({ complete: true, outcomes: [{ status: "already_satisfied" }] });
  expect(f.calls().filter(call => call.query.startsWith("mutation ")).length).toBe(1);
});
test("field update refuses an observed conflict and discloses the API race on success", () => {
  const text = plan([update()]), conflict = fixture(snapshot(true, "human-choice"));
  expect(apply(settings(), conflict.gh, text, digest(text))).toMatchObject({ complete: false, outcomes: [{ status: "conflict" }] });
  expect(conflict.calls().every(call => call.query.startsWith("query "))).toBe(true);
  const success = fixture([...snapshot(true), { operation: "SetField", response: { data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM_1" } } } } }, ...snapshot(true, "done")]);
  expect(apply(settings(), success.gh, text, digest(text))).toMatchObject({ complete: true, outcomes: [{ status: "succeeded", limitation: "GitHub has no atomic field-update condition; a concurrent edit may have been overwritten." }] });
});
test("a timed-out add is reconciled before any retry", () => {
  const text = plan(), f = fixture([...snapshot(), { operation: "AddIssue", fail: true }, ...snapshot(true)]);
  expect(apply(settings(), f.gh, text, digest(text))).toMatchObject({ complete: true, outcomes: [{ status: "reconciled" }] });
  expect(f.calls().filter(call => call.query.startsWith("mutation ")).length).toBe(1);
});
test("failure after one successful write stops and reports the remaining batch", () => {
  const text = plan([{ kind: "add", issue: issue() }, update()]);
  const f = fixture([...snapshot(), { operation: "AddIssue", response: { data: {} } }, ...snapshot(true), ...snapshot(true), { operation: "SetField", fail: true }, ...snapshot(true)]);
  expect(apply(settings(), f.gh, text, digest(text))).toMatchObject({ complete: false, outcomes: [{ status: "succeeded" }, { status: "failed" }] });
});
test("changed project identity and incomplete preflight refuse writes", () => {
  for (const steps of [[{ operation: "ProjectFields", fail: true }], [{ operation: "ProjectFields", response: { data: { organization: { projectV2: { id: "OTHER", url: settings().project, fields: page([]) } } } } }]]) {
    const text = plan(), f = fixture(steps);
    expect(apply(settings(), f.gh, text, digest(text)).complete).toBe(false);
    expect(f.calls().every(call => call.query.startsWith("query "))).toBe(true);
  }
});
