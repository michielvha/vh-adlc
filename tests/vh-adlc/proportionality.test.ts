// Checks the proportionality gate of michielvha/vh-adlc#148: the harm statement in investigate and
// spec authoring, the reviewer's proportionality findings, the convergence trigger and the
// prerequisite check. Prose wraps at any word, so phrases are matched with whitespace collapsed.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const plugin = resolve(import.meta.dir, "../../plugins/vh-adlc");
const read = (path: string) => readFileSync(join(plugin, path), "utf8").replace(/\s+/g, " ");

describe("proportionality gate", () => {
  const loop = read("references/loop.md");
  const investigate = read("skills/vh-adlc-investigate/SKILL.md");
  const spec = read("skills/vh-adlc-spec/SKILL.md");
  const reviewer = read("agents/vh-adlc-reviewer.agent.md");

  test("loop.md defines the harm statement once, with the simplest alternative", () => {
    expect(loop).toContain("## Weigh the harm before building machinery");
    expect(loop).toContain("who is affected, how often, how bad it is, and whether it heals on its own");
    expect(loop).toContain("a process rule, a manual step, documentation, or waiting for a later milestone");
    expect(loop).toContain("Recommend machinery only when it clearly beats that alternative");
  });

  test("loop.md checks a prerequisite before it gates work or fan-out", () => {
    expect(loop).toContain("a prerequisite that loses to its alternative gates nothing");
  });

  test("investigate writes the harm statement before recommending or filing a fix", () => {
    expect(investigate).toContain("Before you recommend or file a fix, write the harm statement and the simplest alternative");
    expect(investigate).toContain("(Weigh the harm before building machinery)");
  });

  test("spec authoring starts Background with the harm statement and the rejected alternative", () => {
    expect(spec).toContain("Start Background with the harm statement");
    expect(spec).toContain("the simplest alternative without machinery, and why the design beats it");
  });

  test("the reviewer flags a missing harm statement and disproportionate machinery", () => {
    expect(reviewer).toContain("A missing harm statement or rejected alternative is a factual finding.");
    expect(reviewer).toContain("Machinery out of proportion to the stated harm is a judgement finding");
    expect(reviewer).toContain("The harm statement findings above keep the severity given there.");
  });

  test("spec review states the convergence trigger with an example and the four choices", () => {
    expect(spec).toContain("this pass and the spec review before it both have blocking findings, and this pass has at least as many");
    expect(spec).toContain("R-5 with 12 blocking after R-4 with 11 fires it; R-5 with 9 does not");
    expect(spec).toContain("When it fires, revise nothing.");
    expect(spec).toContain("keep going, narrow the scope, replace the feature with the alternative, or park it");
    expect(spec).toContain("Act on the answer before any further revision");
  });
});
