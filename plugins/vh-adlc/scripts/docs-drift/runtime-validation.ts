import { AsyncLocalStorage } from "node:async_hooks";
import type { ComponentInspection, ClientProbeResult } from "./bootstrap";
import type { PreflightSnapshot } from "./preflight";
import type { captureRepositoryState } from "./snapshot";

const validation = new AsyncLocalStorage<{
  payloads: Map<string, ComponentInspection>;
  clients: Map<string, Promise<ClientProbeResult>>;
  preflights: Map<string, PreflightSnapshot>;
  /** Caller worktree and Git paths by source repository, with every path checked against them. */
  resources: Map<string, { repo: string; protected: string[]; checked: Set<string> }>;
  caller: { repo: string; state: ReturnType<typeof captureRepositoryState>; unchanged: () => boolean } | null;
}>();

export function currentRuntimeValidation() { return validation.getStore(); }

/** One command shares successful immutable checks. Every later invocation starts cold. */
export function withRuntimeValidation<T>(work: () => T): T {
  if (validation.getStore()) return work();
  return validation.run({ payloads: new Map(), clients: new Map(), preflights: new Map(), resources: new Map(), caller: null }, work);
}
