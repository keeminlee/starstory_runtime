import { cfg } from "../config/env.js";
import { getDbForCampaign } from "../db.js";
import { resolveCampaignSlug } from "../campaign/guildConfig.js";
import { log } from "../utils/logger.js";
import { getMeepoContextQueueStatus, processMeepoContextActionsTick } from "./meepoContextActions.js";
import { toMeepoError } from "../errors/meepoError.js";
import { formatUserFacingError } from "../errors/formatUserFacingError.js";

const workerLog = log.withScope("meepo-context-worker");

function getWorkerScopedLogger(guildId?: string | null) {
  return log.withScope("meepo-context-worker", {
    requireGuildContext: Boolean(guildId),
    callsite: "ledger/meepoContextWorker.ts",
    context: {
      guild_id: guildId ?? undefined,
      campaign_slug: resolveCampaignSlug({ guildId: guildId ?? undefined }),
    },
  });
}
let workerTimer: NodeJS.Timeout | null = null;

function getWorkerDb(guildId?: string | null): any {
  const campaignSlug = resolveCampaignSlug({ guildId: guildId ?? undefined });
  return getDbForCampaign(campaignSlug);
}

export async function runMeepoContextActionWorkerTick(guildId?: string | null): Promise<void> {
  if (!cfg.features.contextWorkerEnabled) return;
  const db = getWorkerDb(guildId);
  const workerTickLog = getWorkerScopedLogger(guildId);
  const result = await processMeepoContextActionsTick(db, "worker", {
    maxActionsPerTick: cfg.meepoContextActions.maxActionsPerTick,
    maxTotalRuntimeMs: cfg.meepoContextActions.maxTotalRuntimeMs,
    leaseTtlMs: cfg.meepoContextActions.leaseTtlMs,
    maxAttempts: cfg.meepoContextActions.maxAttempts,
    retryBaseMs: cfg.meepoContextActions.retryBaseMs,
  });
  if (result.processed > 0) {
    workerTickLog.debug("Context worker tick processed", {
      event_type: "MEEPO_CONTEXT_WORKER_TICK",
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      timed_out: result.timedOut,
      elapsed_ms: result.elapsedMs,
    });
  }
}

export function startMeepoContextActionWorker(guildId?: string | null): void {
  if (!cfg.features.contextWorkerEnabled) {
    workerLog.info("Context worker disabled", {
      event_type: "MEEPO_CONTEXT_WORKER_DISABLED",
    });
    return;
  }
  if (workerTimer) return;
  const intervalMs = cfg.meepoContextActions.pollMs;
  const scopedWorkerLog = getWorkerScopedLogger(guildId);
  workerTimer = setInterval(async () => {
    try {
      await runMeepoContextActionWorkerTick(guildId);
    } catch (error: any) {
      const meepoErr = toMeepoError(error, "ERR_INTERNAL_RUNTIME_FAILURE");
      const payload = formatUserFacingError(meepoErr);
      scopedWorkerLog.error("Context worker tick error", {
        event_type: "MEEPO_CONTEXT_WORKER_TICK_ERROR",
        error_code: payload.code,
        failure_class: payload.failureClass,
        trace_id: payload.trace_id,
        error: error?.message ?? String(error),
      });
    }
  }, intervalMs);
  scopedWorkerLog.info("Context worker started", {
    event_type: "MEEPO_CONTEXT_WORKER_STARTED",
    poll_ms: intervalMs,
  });
}

export function stopMeepoContextActionWorker(): void {
  if (!workerTimer) return;
  clearInterval(workerTimer);
  workerTimer = null;
  workerLog.info("Context worker stopped", {
    event_type: "MEEPO_CONTEXT_WORKER_STOPPED",
  });
}

export function getMeepoContextWorkerStatus(guildId?: string | null): {
  enabled: boolean;
  running: boolean;
  queue: ReturnType<typeof getMeepoContextQueueStatus>;
} {
  const db = getWorkerDb(guildId);
  return {
    enabled: cfg.features.contextWorkerEnabled,
    running: Boolean(workerTimer),
    queue: getMeepoContextQueueStatus(db),
  };
}
