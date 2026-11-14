// The label plan compares a repository with the standard label set and never writes.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildPlan, digest } from "../../../plugins/vh-adlc/scripts/labels/plan";
import { checkout, tracker, vocabularyPath } from "./fixtures";

const standard = (name: string) => {
  const label = (JSON.parse(readFileSync(vocabularyPath, "utf8")).labels as { name: string; color: string; description: string }[]).find((item) => item.name === name)!;
  return { name, color: label.color, description: label.description };
};

describe("label plan", () => {
  test("classifies present, missing, different and unmanaged labels and records its bindings", () => {
    const f = tracker([
      standard("bug"),
      { ...standard("enhancement"), color: "ffffff" },
      { ...standard("refactor"), description: "" },
      { name: "dependencies", color: "0366d6", description: "Pull requests that update a dependency file" },
      { name: "good first issue", color: "7057ff", description: "Good for newcomers" },
    ]);
    const { plan, text } = buildPlan(checkout(), f.gh());
    const status = Object.fromEntries(plan.standard.map((entry) => [entry.standard, entry.status]));
    expect(status).toEqual({ bug: "present", enhancement: "different", documentation: "missing", refactor: "different",
      security: "missing", ready: "missing", blocked: "missing", partial: "missing", "needs-decision": "missing" });
    expect(plan.standard.find((entry) => entry.standard === "enhancement")!.differs).toEqual(["color"]);
    expect(plan.standard.find((entry) => entry.standard === "refactor")!.differs).toEqual(["description"]);
    expect(plan.unmanaged).toEqual(["dependencies", "good first issue"]);
    expect(plan).toMatchObject({ schema_version: 1, host: "github.com", repository: "example/project", actor: "owner",
      vocabulary_sha256: createHash("sha256").update(readFileSync(vocabularyPath)).digest("hex") });
    expect(plan.effective_names.bug).toBe("bug");
    expect(plan.labels_read.map((label) => label.name)).toEqual(["bug", "dependencies", "enhancement", "good first issue", "refactor"]);
    expect(plan.writes).toContainEqual({ action: "update", name: "enhancement", before: { color: "ffffff", description: standard("enhancement").description }, after: { color: standard("enhancement").color, description: standard("enhancement").description } });
    expect(plan.writes).toContainEqual({ action: "create", name: "ready", before: null, after: { color: standard("ready").color, description: standard("ready").description } });
    expect(plan.writes.length).toBe(8);
    expect(digest(text)).toMatch(/^[0-9a-f]{64}$/);
    expect(f.writes()).toEqual([]);
  });

  test("a mapped label counts as the standard one under the repository's name", () => {
    const f = tracker([{ ...standard("bug"), name: "defect" }]);
    const { plan } = buildPlan(checkout("schema_version: 1\nlabel_map:\n  bug: defect\n"), f.gh());
    expect(plan.standard.find((entry) => entry.standard === "bug")).toMatchObject({ name: "defect", status: "present" });
    expect(plan.effective_names.bug).toBe("defect");
    expect(plan.unmanaged).toEqual([]);
    expect(plan.writes.some((write) => write.name === "bug" || write.name === "defect")).toBe(false);
    expect(f.writes()).toEqual([]);
  });

  test("a mapping onto a label outside the set shows it as a managed metadata change", () => {
    const f = tracker([{ name: "dependencies", color: "0366d6", description: "Pull requests that update a dependency file" }]);
    const { plan } = buildPlan(checkout("schema_version: 1\nlabel_map:\n  bug: dependencies\n"), f.gh());
    expect(plan.standard.find((entry) => entry.standard === "bug")).toMatchObject({ name: "dependencies", status: "different", differs: ["color", "description"], mapped: true });
    expect(plan.unmanaged).toEqual([]);
    expect(plan.writes).toContainEqual({ action: "update", name: "dependencies",
      before: { color: "0366d6", description: "Pull requests that update a dependency file" },
      after: { color: standard("bug").color, description: standard("bug").description } });
    expect(f.writes()).toEqual([]);
  });

  test("a label matches its standard name case-insensitively and is never renamed", () => {
    const f = tracker([{ ...standard("bug"), name: "Bug" }]);
    const { plan } = buildPlan(checkout(), f.gh());
    expect(plan.standard.find((entry) => entry.standard === "bug")).toMatchObject({ name: "Bug", status: "present" });
  });
});
