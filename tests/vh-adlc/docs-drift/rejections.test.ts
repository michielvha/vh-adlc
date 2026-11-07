import { expect, test } from "bun:test";
import { gitRejection, httpRejection } from "../../../plugins/vh-adlc/scripts/docs-drift/rejections";

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
