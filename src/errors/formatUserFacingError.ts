import { getObservabilityContext } from "../observability/context.js";
import { MeepoError, type MeepoErrorCode, toMeepoError } from "./meepoError.js";

const DEFAULT_USER_MESSAGE = "⚠️ Meepo stumbled while writing this memory.";

const CODE_USER_MESSAGES: Partial<Record<MeepoErrorCode, string>> = {
  ERR_LLM_TIMEOUT: "⚠️ Meepo timed out while thinking.",
  ERR_LLM_RATE_LIMIT: "⚠️ Meepo is throttled right now. Please try again in a moment.",
  ERR_TTS_FAILED: "⚠️ Meepo couldn't speak that response out loud.",
  ERR_STT_FAILED: "⚠️ Meepo couldn't understand the voice input.",
};

export type UserFacingErrorContext = {
  fallbackMessage?: string;
  trace_id?: string;
  interaction_id?: string;
};

export type UserFacingErrorPayload = {
  content: string;
  code: MeepoErrorCode;
  trace_id?: string;
};

export function formatUserFacingError(
  err: unknown,
  ctx?: UserFacingErrorContext
): UserFacingErrorPayload {
  const obs = getObservabilityContext();
  const known = err instanceof MeepoError ? err : toMeepoError(err, "ERR_UNKNOWN");

  const traceId = ctx?.trace_id ?? known.trace_id ?? obs.trace_id;
  const resolvedMessage = known.userMessage
    ?? CODE_USER_MESSAGES[known.code]
    ?? ctx?.fallbackMessage
    ?? DEFAULT_USER_MESSAGE;

  const contentLines = [resolvedMessage, `(${known.code})`];
  if (traceId) contentLines.push(`trace=${traceId}`);

  return {
    content: contentLines.join("\n"),
    code: known.code,
    trace_id: traceId,
  };
}
