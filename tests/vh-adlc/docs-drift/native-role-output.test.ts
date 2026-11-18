import { expect, test } from "bun:test";

const context = "00000000-0000-4000-8000-000000000001", cwd = "/owned/assessment";
function frames() { return [
  { type: "session.start", data: { sessionId: context, alreadyInUse: false, context: { cwd } } },
  { type: "assistant.message", data: { model: "claude-opus-5.5", content: "MODEL: claude-opus-5.5\nNO FINDINGS\n" } },
]; }

test("native role decoding retains the actual final reply and independently observed context", async () => {
  const { decodeNativeRoleOutput } = await import("../../../plugins/vh-adlc/scripts/docs-drift/native-role-output");
  const events = frames(), text = "MODEL: claude-opus-5.5\nFINDING: F-1\nKIND: factual\nSEVERITY: should-fix\nWHERE: synthetic\nEVIDENCE: final finding\nPROPOSAL: fix it\n";
  events.push({ type: "assistant.message", data: { model: "claude-opus-5.5", content: text } });
  const native = Buffer.from(events.map(event => JSON.stringify(event)).join("\n") + "\n");
  const result = decodeNativeRoleOutput({ provider: "copilot", native, expected_context: context, expected_cwd: cwd });
  expect(result.context_id).toBe(context); expect(Buffer.from(result.returned).toString()).toBe(text);
  expect(result.authority).toBe("none");
});

test.each(["wrong-context", "wrong-cwd", "already-in-use", "missing-start", "duplicate-start", "late-noncanonical", "session-error", "malformed", "invalid-utf8", "unsupported-provider", "reply-before-start", "empty-final", "missing-final", "nonobject", "oversize"])("native role decoding refuses ambiguous or unfinished evidence: %s", async fault => {
  const { decodeNativeRoleOutput } = await import("../../../plugins/vh-adlc/scripts/docs-drift/native-role-output");
  const events: unknown[] = frames();
  if (fault === "wrong-context") (events[0] as ReturnType<typeof frames>[0]).data.sessionId = "00000000-0000-4000-8000-000000000002";
  if (fault === "wrong-cwd") (events[0] as ReturnType<typeof frames>[0]).data.context = { cwd: "/another/source" };
  if (fault === "already-in-use") (events[0] as ReturnType<typeof frames>[0]).data.alreadyInUse = true;
  if (fault === "missing-start") events.shift();
  if (fault === "duplicate-start") events.push(events[0]);
  if (fault === "late-noncanonical") events.push({ type: "assistant.message", data: { content: "The final response is not a completed review" } });
  if (fault === "session-error") events.push({ type: "session.error", data: { message: "Synthetic failed execution" } });
  if (fault === "reply-before-start") events.reverse();
  if (fault === "empty-final") events.push({ type: "assistant.message", data: { content: "" } });
  if (fault === "missing-final") events.pop();
  if (fault === "nonobject") events.push(null);
  let native = Buffer.from(events.map(event => JSON.stringify(event)).join("\n") + "\n");
  if (fault === "malformed") native = Buffer.concat([native, Buffer.from("not JSON\n")]);
  if (fault === "invalid-utf8") native = Buffer.from([0xc3, 0x28]);
  if (fault === "oversize") native = Buffer.alloc(16 * 1024 * 1024 + 1, 0x20);
  expect(() => decodeNativeRoleOutput({ provider: fault === "unsupported-provider" ? "unknown" : "copilot", native,
    expected_context: context, expected_cwd: cwd })).toThrow();
});
