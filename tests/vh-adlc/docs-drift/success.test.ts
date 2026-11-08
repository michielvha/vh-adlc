import { expect, test } from "bun:test";
import { projectSuccess } from "../../../plugins/vh-adlc/scripts/docs-drift/success";
import { sha256 } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";

function response(value: unknown) {
  return Buffer.from("HTTP/2.0 201 Created\r\nX-Secret: header-canary\r\n\r\n" + JSON.stringify(value));
}
test("native success projection retains only fixed facts and content digests", () => {
  const projected = projectSuccess(response({ id: 101, number: 42, title: "private title", body: "private body",
    labels: [{ id: 5, name: "secret label" }], state: "open", draft: true, unrelated: "opaque-canary" }));
  expect(projected).toEqual({ status: 201, facts: { id: 101, number: 42,
    title_sha256: sha256(Buffer.from("private title")), body_sha256: sha256(Buffer.from("private body")),
    labels: [5], state: "open", draft: true, head_sha: null, base_sha: null, merged: null, head_ref: null, base_ref: null,
    head_repository_id: null, base_repository_id: null, user_id: null, user_login_sha256: null,
    parent_repository: null, parent_number: null, parent_url_sha256: null, parent_host: null, parent_path: null } });
  const retained = JSON.stringify(projected);
  for (const canary of ["header-canary", "private title", "private body", "secret label", "opaque-canary"]) {
    expect(retained).not.toContain(canary);
  }
});
test("native success projection refuses incomplete or malformed responses", () => {
  for (const value of [{}, { id: -1 }, { id: 1, body: {} }, { id: 1, number: 0 }, { id: 1, state: "unknown" },
    { id: 1, draft: "false" }, { id: 1, merged: true, merged_at: null }, { id: 1, merged_at: "not-a-date" }, { id: 1, labels: [{ id: 2 }, { id: 2 }] }, null, "untyped", [{ id: 0 }]]) {
    expect(projectSuccess(response(value))).toBeNull();
  }
  expect(projectSuccess(Buffer.from("HTTP/2.0 201 OK\r\nContent-Length: 20\r\n\r\n{}"))).toBeNull();
  expect(projectSuccess(Buffer.from('HTTP/2.0 201 OK\r\n\r\n{"id":'))).toBeNull();
  expect(projectSuccess(Buffer.from("HTTP/2.0 403 Denied\r\n\r\n{}"))).toBeNull();
});
test("native label mutation success preserves empty and complete native ID sets", () => {
  expect(projectSuccess(response([]))?.facts.labels).toEqual([]);
  expect(projectSuccess(response([{ id: 5 }, { id: 2 }]))?.facts.labels).toEqual([2, 5]);
});

test("native PR responses preserve head, repository and creator bindings", () => {
  const facts = projectSuccess(response({ id: 1, number: 77, user: { id: 20, login: "fixture-bot" },
    head: { sha: "a".repeat(40), ref: "docs-drift/one", repo: { id: 10 } },
    base: { ref: "main", sha: "b".repeat(40), repo: { id: 10 } }, merged_at: null }))?.facts;
  expect(facts).toMatchObject({ head_sha: "a".repeat(40), head_ref: "docs-drift/one", base_ref: "main",
    head_repository_id: 10, base_repository_id: 10, base_sha: "b".repeat(40), merged: false, user_id: 20,
    user_login_sha256: sha256(Buffer.from("fixture-bot")) });
});
test("native comment responses preserve their parent binding", () => {
  const facts = projectSuccess(response({ id: 701, body: "comment", user: { id: 20, login: "fixture-bot" },
    issue_url: "https://api.github.com/repos/fixture/docs/issues/77" }))?.facts;
  expect(facts).toMatchObject({ parent_repository: "fixture/docs", parent_number: 77,
    parent_url_sha256: sha256(Buffer.from("https://api.github.com/repos/fixture/docs/issues/77")) });
});
