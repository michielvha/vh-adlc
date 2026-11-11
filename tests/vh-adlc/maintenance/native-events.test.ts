import { expect, test } from "bun:test";
import { parseNativeEvents } from "./native-events";
test("a killed native stream retains a terminal fragment without accepting it as an event", () => {
  const text = '{"type":"thread.started","thread_id":"one"}\n{"type":"item.started","item":';
  expect(parseNativeEvents(text, true)).toMatchObject({ events: [{ type: "thread.started", thread_id: "one" }], terminal_fragment: '{"type":"item.started","item":', complete: false });
  expect(() => parseNativeEvents(text, false)).toThrow();
  expect(() => parseNativeEvents('{"type":"thread.started"}\nnot-json\n{"type":"turn.completed"}\n', true)).toThrow();
  expect(parseNativeEvents('{"type":"turn.completed"}\n', false).complete).toBe(true);
});
