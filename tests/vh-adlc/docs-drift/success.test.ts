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
    labels: [5], state: "open", draft: true } });
  const retained = JSON.stringify(projected);
  for (const canary of ["header-canary", "private title", "private body", "secret label", "opaque-canary"]) {
    expect(retained).not.toContain(canary);
  }
});
test("native success projection refuses incomplete or malformed responses", () => {
  for (const value of [{}, { id: -1 }, { id: 1, body: {} }, { id: 1, number: 0 }, { id: 1, state: "unknown" },
    { id: 1, draft: "false" }, { id: 1, labels: [{ id: 2 }, { id: 2 }] }, null, "untyped", [{ id: 0 }]]) {
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
