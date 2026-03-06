import { cfg } from "../config/env.js";
import {
  getObservabilityContext,
  type ObservabilityContext,
} from "../observability/context.js";

/**
 * Centralized logging system for Meepo.
 *
 * Environment Variables:
 *   LOG_LEVEL=error|warn|info|debug|trace  (default: info)
 *   LOG_SCOPES=voice,stt,tts,ledger,meepo,overlay,meeps,voice-reply,boot,db,session
 *      (optional, default: all scopes allowed)
 *   LOG_FORMAT=pretty|json  (default: pretty)
 *
 * Example Usage:
 *   LOG_LEVEL=debug LOG_SCOPES=voice,voice-reply  node bot.js
 *   LOG_LEVEL=warn  node bot.js  // Only warnings and errors
 *
 * Legacy Compatibility:
 *   DEBUG_VOICE=true  →  Sets LOG_LEVEL=debug and LOG_SCOPES includes 'voice'
 *   DEBUG_LATCH=true  →  Sets LOG_LEVEL=debug and LOG_SCOPES includes 'latch' (latch state tracking)
 *      (emits one-time deprecation warning)
 */

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";
export type LogScope =
  | "voice"
  | "stt"
  | "tts"
  | "ledger"
  | "llm"
  | "db"
  | "session"
  | "boot"
  | "meepo"
  | "meepo-mind"
  | "overlay"
  | "meeps"
  | "voice-reply"
  | "audio-fx"
  | string;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  scope?: string;
  message: string;
  data?: unknown;
}

type ScopedLoggerOptions = {
  context?: ObservabilityContext;
  requireGuildContext?: boolean;
  callsite?: string;
};

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

class Logger {
  private level: number;
  private scopes: Set<string>;
  private format: "pretty" | "json";
  private deprecationWarnings: Set<string> = new Set();
  private missingGuildContextWarnings: Map<string, number> = new Map();

  constructor() {
    this.level = LOG_LEVELS[cfg.logging.level] ?? LOG_LEVELS.info;
    this.scopes = new Set(cfg.logging.scopes ?? []);
    this.format = cfg.logging.format;

    // Legacy compatibility: DEBUG_VOICE → LOG_LEVEL=debug, LOG_SCOPES+=voice
    if (cfg.voice.debug) {
      this.emitDeprecationWarning(
        "DEBUG_VOICE",
        'Set LOG_LEVEL=debug and LOG_SCOPES=voice instead'
      );
      this.level = Math.min(this.level, LOG_LEVELS.debug);

      // Add "voice" to scopes if scopes were empty (all allowed)
      if (this.scopes.size === 0) {
        // Empty scopes means all are allowed, so we don't add "voice"
      } else {
        this.scopes.add("voice");
      }
    }

    // Legacy compatibility: DEBUG_LATCH → LOG_LEVEL=debug, LOG_SCOPES+=latch
    if (cfg.logging.debugLatch) {
      this.emitDeprecationWarning(
        "DEBUG_LATCH",
        'Set LOG_LEVEL=debug and LOG_SCOPES=latch instead'
      );
      this.level = Math.min(this.level, LOG_LEVELS.debug);
      if (this.scopes.size > 0) {
        this.scopes.add("latch");
      }
    }
  }

  private emitDeprecationWarning(oldVar: string, replacement: string): void {
    if (this.deprecationWarnings.has(oldVar)) return;
    this.deprecationWarnings.add(oldVar);
    console.warn(
      `[Logger] DEPRECATED: ${oldVar} is deprecated. ${replacement}`
    );
  }

  private shouldLog(level: LogLevel, scope?: string): boolean {
    // Check level
    if (LOG_LEVELS[level] < this.level) return false;

    // Check scope: if scopes are set, only log if scope matches
    if (this.scopes.size > 0 && scope && !this.scopes.has(scope)) {
      return false;
    }

    return true;
  }

  private formatOutput(entry: LogEntry): string {
    if (this.format === "json") {
      return JSON.stringify(entry);
    }

    // Pretty format with better visual hierarchy
    const time = entry.timestamp.split("T")[1].split(".")[0]; // HH:MM:SS
    const levelAbbr = {
      trace: "TRC",
      debug: "DBG",
      info: "INF",
      warn: "WRN",
      error: "ERR",
    }[entry.level];
    const scopeStr = entry.scope ? ` │ ${entry.scope}` : "";
    const dataStr = entry.data ? ` │ ${JSON.stringify(entry.data)}` : "";

    return `${time} [${levelAbbr}]${scopeStr} ${entry.message}${dataStr}`;
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private normalizeContext(context?: ObservabilityContext): ObservabilityContext {
    if (!context) return {};
    const out: ObservabilityContext = {};
    if (typeof context.trace_id === "string" && context.trace_id.length > 0) out.trace_id = context.trace_id;
    if (typeof context.interaction_id === "string" && context.interaction_id.length > 0) {
      out.interaction_id = context.interaction_id;
    }
    if (typeof context.guild_id === "string" && context.guild_id.length > 0) out.guild_id = context.guild_id;
    if (typeof context.campaign_slug === "string" && context.campaign_slug.length > 0) {
      out.campaign_slug = context.campaign_slug;
    }
    if (typeof context.session_id === "string" && context.session_id.length > 0) out.session_id = context.session_id;
    return out;
  }

  private mergeLogData(data: unknown, context: ObservabilityContext): unknown {
    const hasContext = Object.keys(context).length > 0;
    if (!hasContext) return data;
    if (data === undefined) return context;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return { ...context, ...(data as Record<string, unknown>) };
    }
    return {
      ...context,
      data,
    };
  }

  private maybeEmitMissingGuildWarning(scope: string | undefined, callsite: string | undefined): void {
    const key = `${scope ?? "global"}:${callsite ?? "unknown"}`;
    const now = Date.now();
    const last = this.missingGuildContextWarnings.get(key) ?? 0;
    const throttleMs = 60_000;
    if (now - last < throttleMs) return;
    this.missingGuildContextWarnings.set(key, now);
    this.warn(
      "Missing required guild logging context",
      scope,
      {
        guild_ctx_missing: true,
        callsite: callsite ?? "unknown",
        throttle_ms: throttleMs,
      }
    );
  }

  private emit(entry: LogEntry): void {
    const output = this.formatOutput(entry);

    switch (entry.level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "info":
        console.log(output);
        break;
      case "debug":
        console.log(output);
        break;
      case "trace":
        console.debug(output);
        break;
    }
  }

  trace(message: string, scope?: LogScope, data?: unknown): void {
    this.emitWithContext({ level: "trace", message, scope, data });
  }

  debug(message: string, scope?: LogScope, data?: unknown): void {
    this.emitWithContext({ level: "debug", message, scope, data });
  }

  info(message: string, scope?: LogScope, data?: unknown): void {
    this.emitWithContext({ level: "info", message, scope, data });
  }

  warn(message: string, scope?: LogScope, data?: unknown): void {
    this.emitWithContext({ level: "warn", message, scope, data });
  }

  error(message: string, scope?: LogScope, data?: unknown): void {
    this.emitWithContext({ level: "error", message, scope, data });
  }

  emitWithContext(args: {
    level: LogLevel;
    message: string;
    scope?: LogScope;
    data?: unknown;
    context?: ObservabilityContext;
    requireGuildContext?: boolean;
    callsite?: string;
  }): void {
    if (!this.shouldLog(args.level, args.scope)) return;

    const current = this.normalizeContext(getObservabilityContext());
    const explicit = this.normalizeContext(args.context);
    const mergedContext = {
      ...current,
      ...explicit,
    } satisfies ObservabilityContext;

    let enforcedContext = mergedContext;
    if (args.requireGuildContext && !mergedContext.guild_id) {
      enforcedContext = {
        ...mergedContext,
        guild_ctx_missing: true,
      } as ObservabilityContext & { guild_ctx_missing: true };
      this.maybeEmitMissingGuildWarning(args.scope, args.callsite);
    }

    this.emit({
      timestamp: this.getTimestamp(),
      level: args.level,
      scope: args.scope,
      message: args.message,
      data: this.mergeLogData(args.data, enforcedContext),
    });
  }

  /**
   * Create a scoped logger that automatically includes a scope in all messages.
   * Usage: const voiceLog = log.withScope("voice");
   *        voiceLog.debug("message") -> logs with scope="voice"
   */
  withScope(scope: LogScope, options?: ScopedLoggerOptions): ScopedLogger {
    return new ScopedLogger(this, scope, options);
  }
}

/**
 * A logger bound to a specific scope.
 * All messages automatically include the scope.
 */
class ScopedLogger {
  constructor(
    private logger: Logger,
    private scope: LogScope,
    private options?: ScopedLoggerOptions
  ) {}

  withContext(context: ObservabilityContext): ScopedLogger {
    return new ScopedLogger(this.logger, this.scope, {
      ...this.options,
      context: {
        ...(this.options?.context ?? {}),
        ...context,
      },
    });
  }

  private emit(level: LogLevel, message: string, data?: unknown, context?: ObservabilityContext): void {
    this.logger.emitWithContext({
      level,
      message,
      scope: this.scope,
      data,
      context: {
        ...(this.options?.context ?? {}),
        ...(context ?? {}),
      },
      requireGuildContext: this.options?.requireGuildContext,
      callsite: this.options?.callsite,
    });
  }

  trace(message: string, data?: unknown, context?: ObservabilityContext): void {
    this.emit("trace", message, data, context);
  }

  debug(message: string, data?: unknown, context?: ObservabilityContext): void {
    this.emit("debug", message, data, context);
  }

  info(message: string, data?: unknown, context?: ObservabilityContext): void {
    this.emit("info", message, data, context);
  }

  warn(message: string, data?: unknown, context?: ObservabilityContext): void {
    this.emit("warn", message, data, context);
  }

  error(message: string, data?: unknown, context?: ObservabilityContext): void {
    this.emit("error", message, data, context);
  }
}

// Export singleton instance
export const log = new Logger();
export default log;
