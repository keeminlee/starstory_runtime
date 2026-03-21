import { WebAuthError } from "@/lib/server/authContext";
import { CapabilityUnavailableError } from "@/lib/server/capabilityErrors";
import { formatUserFacingError } from "../../../../src/errors/formatUserFacingError.js";

export type WebDataErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid_request"
  | "active_session_archive_blocked"
  | "ambiguous_campaign_scope"
  | "ambiguous_session_scope"
  | "conflict"
  | "transcript_unavailable"
  | "recap_unavailable"
  | "recap_invalid_output"
  | "recap_in_progress"
  | "recap_rate_limited"
  | "recap_capacity_reached"
  | "generation_failed"
  | "RECAP_SPEAKER_ATTRIBUTION_REQUIRED"
  | "openai_unconfigured"
  | "anthropic_unconfigured"
  | "google_unconfigured"
  | "llm_unconfigured"
  | "discord_refresh_unconfigured"
  | "internal";

export class WebDataError extends Error {
  readonly code: WebDataErrorCode;
  readonly status: number;
  readonly details?: WebErrorResponse["error"]["details"];

  constructor(
    code: WebDataErrorCode,
    status: number,
    message: string,
    options?: { cause?: unknown; details?: WebErrorResponse["error"]["details"] }
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "WebDataError";
    this.code = code;
    this.status = status;
    this.details = options?.details;
  }
}

export type WebErrorResponse = {
  error: {
    code: WebDataErrorCode;
    message: string;
    details?: {
      recapCode?: string;
      meepoCode?: string;
      failureClass?: "retryable" | "corrective" | "internal";
      retryable?: boolean;
      correctiveActionRequired?: boolean;
      traceId?: string;
      provider?: string;
      model?: string;
      envKey?: string;
      providerCode?: string;
      status?: number;
    };
  };
};

function buildWebErrorDetails(error: unknown): WebErrorResponse["error"]["details"] | undefined {
  const formatted = formatUserFacingError(error);
  const rawCode =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  const details: NonNullable<WebErrorResponse["error"]["details"]> = {};

  if (rawCode.startsWith("RECAP_")) details.recapCode = rawCode;
  if (formatted.code !== "ERR_UNKNOWN") details.meepoCode = formatted.code;
  details.failureClass = formatted.failureClass;
  details.retryable = formatted.retryable;
  details.correctiveActionRequired = formatted.correctiveActionRequired;
  if (formatted.trace_id) details.traceId = formatted.trace_id;
  if (formatted.diagnostics?.provider) details.provider = formatted.diagnostics.provider;
  if (formatted.diagnostics?.model) details.model = formatted.diagnostics.model;
  if (formatted.diagnostics?.envKey) details.envKey = formatted.diagnostics.envKey;
  if (formatted.diagnostics?.providerCode) details.providerCode = formatted.diagnostics.providerCode;
  if (typeof formatted.diagnostics?.status === "number") details.status = formatted.diagnostics.status;

  return Object.keys(details).length > 0 ? details : undefined;
}

function makeWebDataError(code: WebDataErrorCode, status: number, message: string, cause: unknown): WebDataError {
  return new WebDataError(code, status, message, {
    cause,
    details: buildWebErrorDetails(cause),
  });
}

export function mapToWebDataError(error: unknown): WebDataError {
  if (error instanceof WebDataError) {
    return error;
  }

  if (error instanceof WebAuthError) {
    return makeWebDataError("unauthorized", 401, error.message, error);
  }

  if (error instanceof CapabilityUnavailableError) {
    return makeWebDataError(error.code, error.status, error.message, error);
  }

  const recapCode =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (recapCode === "SCOPE_VIOLATION") {
    const message = error instanceof Error ? error.message : String(error);
    return makeWebDataError("not_found", 404, message, error);
  }
  if (recapCode.startsWith("RECAP_")) {
    const message = error instanceof Error ? error.message : String(error);
    if (recapCode === "RECAP_SESSION_NOT_FOUND") {
      return makeWebDataError("not_found", 404, message, error);
    }
    if (recapCode === "RECAP_SESSION_ACTIVE") {
      return makeWebDataError("conflict", 409, message, error);
    }
    if (recapCode === "RECAP_TRANSCRIPT_UNAVAILABLE") {
      return makeWebDataError("transcript_unavailable", 424, message, error);
    }
    if (recapCode === "RECAP_INVALID_OUTPUT") {
      return makeWebDataError("recap_invalid_output", 502, message, error);
    }
    if (recapCode === "RECAP_IN_PROGRESS") {
      return makeWebDataError("recap_in_progress", 409, message, error);
    }
    if (recapCode === "RECAP_RATE_LIMITED") {
      return makeWebDataError("recap_rate_limited", 429, message, error);
    }
    if (recapCode === "RECAP_CAPACITY_REACHED") {
      return makeWebDataError("recap_capacity_reached", 503, message, error);
    }
    if (recapCode === "RECAP_GENERATION_FAILED") {
      return makeWebDataError("generation_failed", 502, message, error);
    }
    if (recapCode === "RECAP_SPEAKER_ATTRIBUTION_REQUIRED") {
      return makeWebDataError("RECAP_SPEAKER_ATTRIBUTION_REQUIRED", 409, message, error);
    }
    return makeWebDataError("recap_unavailable", 424, message, error);
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/session not found/i.test(message)) {
    return makeWebDataError("not_found", 404, message, error);
  }
  if (/transcript|no bronze transcript|no transcript/i.test(message)) {
    return makeWebDataError("transcript_unavailable", 424, message, error);
  }

  if (/OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|llm provider/i.test(message)) {
    if (/OPENAI_API_KEY|openai api key/i.test(message)) {
      return makeWebDataError(
        "openai_unconfigured",
        503,
        "This action is unavailable until OPENAI_API_KEY is configured.",
        error
      );
    }
    if (/ANTHROPIC_API_KEY|anthropic api key/i.test(message)) {
      return makeWebDataError(
        "anthropic_unconfigured",
        503,
        "This action is unavailable until ANTHROPIC_API_KEY is configured.",
        error
      );
    }
    if (/GOOGLE_API_KEY|google api key/i.test(message)) {
      return makeWebDataError(
        "google_unconfigured",
        503,
        "This action is unavailable until GOOGLE_API_KEY is configured.",
        error
      );
    }
    return makeWebDataError(
      "llm_unconfigured",
      503,
      "This action is unavailable until the selected LLM provider is configured.",
      error
    );
  }

  if (/DISCORD_TOKEN/i.test(message)) {
    return makeWebDataError(
      "discord_refresh_unconfigured",
      503,
      "Discord refresh capability is unavailable because DISCORD_TOKEN is not configured.",
      error
    );
  }

  return makeWebDataError("internal", 500, message || "Unknown session data error", error);
}

export function toWebErrorResponse(error: unknown): {
  status: number;
  body: WebErrorResponse;
} {
  const mapped = mapToWebDataError(error);
  return {
    status: mapped.status,
    body: {
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details ? { details: mapped.details } : {}),
      },
    },
  };
}
