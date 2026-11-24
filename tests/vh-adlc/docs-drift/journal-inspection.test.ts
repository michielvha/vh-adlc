import { afterAll, expect, test } from "bun:test";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { publicationFixture } from "./publication-fixture";
import * as journals from "../../../plugins/vh-adlc/scripts/docs-drift/journal";
import { readGit } from "../../../plugins/vh-adlc/scripts/docs-drift/git";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("a copied legacy journal supports bounded inspection and retains its original grants and policy bytes", () => {
  const f = publicationFixture(roots), journal = journals.createJournal({ source_repo: f.repo, artifact_root: f.artifacts, plan: f.plan });
  const copy = join(f.root, "observation"); cpSync(f.artifacts, copy, { recursive: true });
  const directory = join(copy, "docs-drift-" + f.plan.manifest.operation_id), original = readFileSync(join(directory, "plan.json"));
  const inspected = journals.inspectJournal(directory, f.repo);
  expect(inspected).toMatchObject({ authority: "none", replay_authority: false, plan: journal.plan, revision: journal.revision });
  expect(inspected.plan.schema_version).toBe(1);
  expect(inspected.plan.approval_sha256).toBe(f.plan.approval_sha256);
  expect(inspected.pending_effect_ids).toEqual(f.plan.manifest.effects.map(effect => effect.id));
  expect(readFileSync(join(directory, "plan.json"))).toEqual(original);
  expect(() => journals.readJournal(directory, f.repo)).toThrow("ownership");
  const relocated = join(f.root, "relocated-source"); readGit(f.root, "clone", "--no-local", f.repo, relocated);
  expect(journals.inspectJournal(directory, relocated).plan).toEqual(journal.plan);
  expect(() => journals.readJournal(directory, relocated)).toThrow("ownership");
  writeFileSync(join(directory, "plan.json"), Buffer.from("changed"));
  expect(() => journals.inspectJournal(directory, f.repo)).toThrow("plan");
});
