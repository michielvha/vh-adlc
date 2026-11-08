import { expect, test } from "bun:test";
import { projectGitSuccess } from "../../../plugins/vh-adlc/scripts/docs-drift/git-success";
import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

const updates = [{ ref: "refs/heads/docs-drift/one", head: "a".repeat(40), expected: "" }];
const successful = "To https://github.com/fixture/docs.git\n*\t" + updates[0].head + ":" + updates[0].ref + "\t[new branch]\nDone\n";

test("positive Git projection retains every terminal ref without response prose", () => {
  const response = successful.replace("[new branch]", "sensitive-response-canary");
  const projected = projectGitSuccess(Buffer.from(response), updates);
  expect(projected?.updates).toEqual(updates);
  expect(projected?.statuses).toEqual(["*"]);
  expect(canonicalJSON(projected).toString()).not.toContain("sensitive-response-canary");
});

for (const [name, response] of [
  ["missing newline", successful.slice(0, -1)], ["missing terminator", successful.replace("Done\n", "")],
  ["missing status", successful.split("\n").filter(line => !line.startsWith("*")).join("\n")],
  ["rejected", successful.replace("*\t", "!\t")], ["unknown", successful.replace("*\t", "?\t")],
  ["wrong ref", successful.replace("refs/heads/docs-drift/one", "refs/heads/other")],
  ["wrong head", successful.replace("a".repeat(40), "b".repeat(40))],
  ["duplicate", successful.replace("Done\n", successful.split("\n")[1] + "\nDone\n")],
  ["delete mismatch", successful.replace("*\t", "-\t")],
  ["NUL", successful.replace("[new branch]", "invalid\0summary")],
  ["empty destination", successful.replace("To https://github.com/fixture/docs.git", "To ")],
] as const) {
  test(`positive Git projection refuses ${name}`, () => {
    expect(projectGitSuccess(Buffer.from(response), updates)).toBeNull();
  });
}

test("positive Git projection requires complete atomic statuses and valid deletion", () => {
  const companion = { ref: "refs/heads/docs-drift/two", head: "b".repeat(40), expected: "" };
  expect(projectGitSuccess(Buffer.from(successful), [...updates, companion])).toBeNull();
  const response = successful.replace("Done\n", "=\t" + companion.head + ":" + companion.ref + "\t[up to date]\nDone\n");
  expect(projectGitSuccess(Buffer.from(response), [...updates, companion])).toBeNull();
  const deletion = [{ ...updates[0], head: null, expected: updates[0].head }];
  const deleted = "To https://github.com/fixture/docs.git\n-\t:" + deletion[0].ref + "\t[deleted]\nDone\n";
  expect(projectGitSuccess(Buffer.from(deleted), deletion)?.statuses).toEqual(["-"]);
  expect(projectGitSuccess(Buffer.from(deleted.replace("-\t", "=\t")), deletion)).toBeNull();
});

test("an up-to-date response cannot supply application proof for this attempt", () => {
  expect(projectGitSuccess(Buffer.from(successful.replace("*\t", "=\t")), updates)).toBeNull();
});

test("terminal status distinguishes new refs from CAS rewrites", () => {
  expect(projectGitSuccess(Buffer.from(successful.replace("*\t", "+\t")), updates)).toBeNull();
  const rewrite = [{ ...updates[0], expected: "b".repeat(40) }];
  expect(projectGitSuccess(Buffer.from(successful), rewrite)).toBeNull();
});
