import { isAbsolute } from "node:path";
import { fullModel } from "./manifests";
import { OUTPUT_LIMIT } from "./owned-process";
import { decodeUTF8 } from "./protocol";

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Native role event object required");
  return value as Record<string, unknown>;
}

/** Decode original provider output. This establishes no execution origin or permission. */
export function decodeNativeRoleOutput(options: {
  provider: string; native: Uint8Array; expected_context: string; expected_cwd: string;
}) {
  if (options.provider !== "copilot") throw Error("Native role output provider unavailable");
  if (!options.expected_context || !isAbsolute(options.expected_cwd) || options.native.byteLength > OUTPUT_LIMIT)
    throw Error("Bounded native role context required");
  let context: string | null = null, returned: Buffer | null = null;
  for (const line of decodeUTF8(options.native).split("\n")) {
    if (!line.trim()) continue;
    const event = object(JSON.parse(line));
    if (typeof event.type !== "string" || !event.type) throw Error("Native role event type required");
    if (event.type === "session.error") throw Error("Native role execution failed");
    if (event.type === "session.start") {
      const data = object(event.data), launch = object(data.context);
      if (context !== null || data.sessionId !== options.expected_context || launch.cwd !== options.expected_cwd || data.alreadyInUse !== false)
        throw Error("Native role fresh context changed");
      context = data.sessionId as string;
    }
    if (event.type === "assistant.message") {
      if (context === null) throw Error("Native role reply preceded its context");
      const data = object(event.data);
      // Keep the final message even when invalid; an earlier clean reply cannot replace it.
      returned = typeof data.content === "string" ? Buffer.from(data.content) : null;
      if (returned !== null && data.model !== undefined) fullModel(data.model);
    }
  }
  if (context === null || returned === null || !/^MODEL: [A-Za-z][A-Za-z0-9_.:-]*[0-9][A-Za-z0-9_.:-]*\n/u.test(decodeUTF8(returned)))
    throw Error("Native role final canonical reply required");
  return { authority: "none" as const, context_id: context, returned };
}
