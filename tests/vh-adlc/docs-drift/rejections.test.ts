import { canonicalJSON } from "../../../plugins/vh-adlc/scripts/docs-drift/protocol";
import { expect, test } from "bun:test";
import { gitRejection, httpRejection, projectRejection, projectedRejection } from "../../../plugins/vh-adlc/scripts/docs-drift/rejections";

const updates = [{ ref: "refs/heads/docs-drift/one", head: "a".repeat(40) },
  { ref: "refs/heads/docs-drift/receipt/one", head: "b".repeat(40) }];
function rejected(summary = "[rejected] (stale info)") {
  return "To https://github.com/fixture/docs.git\n" + updates.map(item => `!\t${item.head}:${item.ref}\t${summary}\n`).join("") + "Done\n";
}
test("only a complete negative porcelain report for every expected ref proves rejection", () => {
  expect(gitRejection(Buffer.from(rejected()), updates)).not.toBeNull();
  expect(gitRejection(Buffer.from(rejected("[remote rejected] (pre-receive hook declined)")), updates)).not.toBeNull();
  for (const text of ["", rejected().replace("Done\n", ""), rejected().replace("!\t", "*\t"),
    rejected().replace(updates[1].ref, "refs/heads/foreign"), rejected().replace("stale info", "unknown reason"),
    rejected() + "truncated\n", rejected().replace(updates[1].head, "c".repeat(40))]) {
    expect(gitRejection(Buffer.from(text), updates)).toBeNull();
  }
});
test("only a complete non-retryable 4xx API response proves non-application", () => {
  expect(httpRejection(Buffer.from('HTTP/2.0 403 Forbidden\r\n\r\n{"message":"denied"}'))).toEqual({ protocol: "http", status: 403 });
  for (const text of ['HTTP/2.0 403 Forbidden\r\n\r\n{"message":', 'HTTP/2.0 408 Timeout\r\n\r\n{}',
    'HTTP/2.0 429 Too Many Requests\r\n\r\n{}', 'HTTP/2.0 502 Bad Gateway\r\n\r\n{}',
    'HTTP/2.0 403 Forbidden\r\nContent-Length: 100\r\n\r\n{}', 'HTTP/2.0 201 Created\r\n\r\n{}']) {
    expect(httpRejection(Buffer.from(text))).toBeNull();
  }
});

test("rejection projections omit response bodies and secret-bearing headers", () => {
  const bytes = Buffer.from('HTTP/2.0 403 Forbidden\r\nX-Secret: header-canary\r\n\r\n{"message":"body-canary"}');
  const projected = projectRejection(bytes, { protocol: "http" });
  expect(projected).not.toBeNull();
  const text = projected!.toString();
  expect(text).not.toContain("header-canary");
  expect(text).not.toContain("body-canary");
  expect(JSON.parse(text).observed).toEqual({ protocol: "http", status: 403 });
  expect(projectRejection(Buffer.from(rejected()), { protocol: "git", updates })).not.toBeNull();
  expect(projectRejection(Buffer.from(rejected().replace("!\t", "*\t")), { protocol: "git", updates })).toBeNull();
});

test("projected Git evidence rejects vacuous and duplicate ref selections", () => {
  for (const selected of [[], [updates[0], updates[0]]]) {
    const protocol = { protocol: "git" as const, updates: selected };
    const bytes = canonicalJSON({ schema_version: 2, protocol, response_sha256: "a".repeat(64),
      observed: { protocol: "git", refs: selected.map(item => item.ref), statuses: selected.map(() => ({ kind: "rejected", reason: "stale info" })) } });
    expect(() => projectedRejection(bytes, protocol)).toThrow();
  }
});

test("projected Git recovery rechecks status reasons and exact schema", () => {
  const protocol = { protocol: "git" as const, updates };
  const valid = projectRejection(Buffer.from(rejected()), protocol)!;
  expect(projectedRejection(valid, protocol)).toEqual({ protocol: "git", refs: updates.map(item => item.ref),
    statuses: updates.map(() => ({ kind: "rejected", reason: "stale info" })) });
  for (const change of [
    (value: { observed: { statuses: { kind: string; reason: string }[]; extra?: boolean } }) => { value.observed.statuses[0].reason = "unknown"; },
    (value: { observed: { statuses: { kind: string; reason: string }[]; extra?: boolean } }) => { value.observed.statuses[0].kind = "accepted"; },
    (value: { observed: { statuses: { kind: string; reason: string }[]; extra?: boolean } }) => { value.observed.statuses.pop(); },
    (value: { observed: { statuses: { kind: string; reason: string }[]; extra?: boolean } }) => { value.observed.extra = true; },
  ]) {
    const value = JSON.parse(valid.toString());
    change(value);
    expect(() => projectedRejection(canonicalJSON(value), protocol)).toThrow();
  }
});
