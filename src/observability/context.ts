import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

export type ObservabilityContext = {
  trace_id?: string;
  interaction_id?: string;
  guild_id?: string;
  campaign_slug?: string;
  session_id?: string;
};

const contextStorage = new AsyncLocalStorage<ObservabilityContext>();

export function createTraceId(length: number = 12): string {
  const raw = randomBytes(8).toString("hex");
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.slice(0, Math.max(6, Math.min(length, normalized.length)));
}

export function getOrCreateTraceId(length: number = 12): string {
  const existing = getObservabilityContext().trace_id;
  if (typeof existing === "string" && existing.trim().length > 0) {
    return existing;
  }
  return createTraceId(length);
}

export function getInteractionId(source: any): string | undefined {
  if (!source || typeof source !== "object") return undefined;
  const id = source.id;
  return typeof id === "string" && id.trim().length > 0 ? id : undefined;
}

export function getObservabilityContext(): ObservabilityContext {
  return contextStorage.getStore() ?? {};
}

export function runWithObservabilityContext<T>(
  context: ObservabilityContext,
  fn: () => T
): T {
  const merged = {
    ...getObservabilityContext(),
    ...context,
  } satisfies ObservabilityContext;
  return contextStorage.run(merged, fn);
}
