/**
 * Auto-Sleep: Automatically sleep Meepo after inactivity
 * 
 * Checks for the freshest available activity baseline at regular intervals.
 * If inactivity exceeds the configured threshold, sleeps Meepo, disconnects voice,
 * and explicitly ends the active session with reason `auto_sleep`.
 */

import { log } from "../utils/logger.js";
import { getActiveMeepo, sleepMeepo } from "./state.js";
import { cfg } from "../config/env.js";
import { resolveCampaignSlug } from "../campaign/guildConfig.js";
import { getDbForCampaign } from "../db.js";
import { getControlDb } from "../db.js";
import { endSession, getActiveSession } from "../sessions/sessions.js";
import { getVoiceState } from "../voice/state.js";
import { leaveVoice } from "../voice/connection.js";

const meepoLog = log.withScope("meepo");

const AUTO_SLEEP_MS = cfg.session.autoSleepMs;
const CHECK_INTERVAL_MS = 60000; // Check every 60 seconds

let checkInterval: NodeJS.Timeout | null = null;

export type AutoSleepBaselineSource =
  | "ledger"
  | "session_started_at"
  | "session_created_at"
  | "meepo_created_at"
  | "none";

export type AutoSleepEvaluation = {
  guildId: string;
  campaignSlug: string;
  sessionId: string | null;
  nowMs: number;
  thresholdMs: number;
  baselineSource: AutoSleepBaselineSource;
  lastLedgerTimestampMs: number | null;
  lastActivityTimestampMs: number | null;
  inactivityMs: number | null;
  shouldSleep: boolean;
  decisionReason:
    | "disabled"
    | "no_active_meepo"
    | "no_activity_baseline"
    | "below_threshold"
    | "threshold_exceeded";
};

function chooseLatestActivityCandidate(candidates: Array<{ source: AutoSleepBaselineSource; timestampMs: number | null }>) {
  const valid = candidates.filter(
    (candidate): candidate is { source: Exclude<AutoSleepBaselineSource, "none">; timestampMs: number } =>
      typeof candidate.timestampMs === "number" && Number.isFinite(candidate.timestampMs)
  );

  if (valid.length === 0) {
    return {
      baselineSource: "none" as const,
      lastActivityTimestampMs: null,
    };
  }

  const selected = valid.reduce((latest, candidate) =>
    candidate.timestampMs > latest.timestampMs ? candidate : latest
  );

  return {
    baselineSource: selected.source,
    lastActivityTimestampMs: selected.timestampMs,
  };
}

export function evaluateAutoSleepForGuild(guildId: string, nowMs: number = Date.now()): AutoSleepEvaluation {
  const activeMeepo = getActiveMeepo(guildId);
  const campaignSlug = resolveCampaignSlug({ guildId });

  if (!activeMeepo) {
    return {
      guildId,
      campaignSlug,
      sessionId: null,
      nowMs,
      thresholdMs: AUTO_SLEEP_MS,
      baselineSource: "none",
      lastLedgerTimestampMs: null,
      lastActivityTimestampMs: null,
      inactivityMs: null,
      shouldSleep: false,
      decisionReason: "no_active_meepo",
    };
  }

  if (AUTO_SLEEP_MS <= 0) {
    return {
      guildId,
      campaignSlug,
      sessionId: getActiveSession(guildId)?.session_id ?? null,
      nowMs,
      thresholdMs: AUTO_SLEEP_MS,
      baselineSource: "none",
      lastLedgerTimestampMs: null,
      lastActivityTimestampMs: null,
      inactivityMs: null,
      shouldSleep: false,
      decisionReason: "disabled",
    };
  }

  const campaignDb = getDbForCampaign(campaignSlug);
  const activeSession = getActiveSession(guildId);
  const lastEntry = campaignDb
    .prepare(`
      SELECT timestamp_ms
      FROM ledger_entries
      WHERE guild_id = ?
      ORDER BY timestamp_ms DESC
      LIMIT 1
    `)
    .get(guildId) as { timestamp_ms: number } | undefined;

  const lastLedgerTimestampMs = lastEntry?.timestamp_ms ?? null;
  const selectedBaseline = chooseLatestActivityCandidate([
    { source: "ledger", timestampMs: lastLedgerTimestampMs },
    { source: "session_started_at", timestampMs: activeSession?.started_at_ms ?? null },
    { source: "session_created_at", timestampMs: activeSession?.created_at_ms ?? null },
    { source: "meepo_created_at", timestampMs: activeMeepo.created_at_ms ?? null },
  ]);

  if (selectedBaseline.lastActivityTimestampMs === null) {
    return {
      guildId,
      campaignSlug,
      sessionId: activeSession?.session_id ?? null,
      nowMs,
      thresholdMs: AUTO_SLEEP_MS,
      baselineSource: selectedBaseline.baselineSource,
      lastLedgerTimestampMs,
      lastActivityTimestampMs: null,
      inactivityMs: null,
      shouldSleep: false,
      decisionReason: "no_activity_baseline",
    };
  }

  const inactivityMs = nowMs - selectedBaseline.lastActivityTimestampMs;
  const shouldSleep = inactivityMs >= AUTO_SLEEP_MS;

  return {
    guildId,
    campaignSlug,
    sessionId: activeSession?.session_id ?? null,
    nowMs,
    thresholdMs: AUTO_SLEEP_MS,
    baselineSource: selectedBaseline.baselineSource,
    lastLedgerTimestampMs,
    lastActivityTimestampMs: selectedBaseline.lastActivityTimestampMs,
    inactivityMs,
    shouldSleep,
    decisionReason: shouldSleep ? "threshold_exceeded" : "below_threshold",
  };
}

function applyAutoSleepEvaluation(evaluation: AutoSleepEvaluation): void {
  if (!evaluation.shouldSleep) {
    return;
  }

  const hadVoiceConnection = Boolean(getVoiceState(evaluation.guildId));
  const endedSessions = evaluation.sessionId ? endSession(evaluation.guildId, "auto_sleep") : 0;

  if (hadVoiceConnection) {
    leaveVoice(evaluation.guildId);
  }

  const sleptInstances = sleepMeepo(evaluation.guildId);

  meepoLog.info("Auto-sleep triggered", {
    event_type: "AUTO_SLEEP",
    guild_id: evaluation.guildId,
    campaign_slug: evaluation.campaignSlug,
    session_id: evaluation.sessionId,
    last_activity_ms: evaluation.lastActivityTimestampMs,
    baseline_source: evaluation.baselineSource,
    now_ms: evaluation.nowMs,
    inactivity_ms: evaluation.inactivityMs,
    threshold_ms: evaluation.thresholdMs,
    decision_reason: evaluation.decisionReason,
    ended_sessions: endedSessions,
    left_voice: hadVoiceConnection,
    slept_instances: sleptInstances,
  });
}

export function runAutoSleepCheck(nowMs: number = Date.now()): AutoSleepEvaluation[] {
  const controlDb = getControlDb();
  const evaluations: AutoSleepEvaluation[] = [];

  try {
    const activeInstances = controlDb
      .prepare("SELECT DISTINCT guild_id FROM npc_instances WHERE is_active = 1")
      .all() as { guild_id: string }[];

    for (const { guild_id } of activeInstances) {
      const evaluation = evaluateAutoSleepForGuild(guild_id, nowMs);
      evaluations.push(evaluation);

      meepoLog.debug("Auto-sleep evaluation", {
        event_type: "AUTO_SLEEP_EVALUATION",
        guild_id: evaluation.guildId,
        campaign_slug: evaluation.campaignSlug,
        session_id: evaluation.sessionId,
        last_ledger_timestamp_ms: evaluation.lastLedgerTimestampMs,
        last_activity_ms: evaluation.lastActivityTimestampMs,
        baseline_source: evaluation.baselineSource,
        now_ms: evaluation.nowMs,
        inactivity_ms: evaluation.inactivityMs,
        threshold_ms: evaluation.thresholdMs,
        should_sleep: evaluation.shouldSleep,
        decision_reason: evaluation.decisionReason,
      });

      applyAutoSleepEvaluation(evaluation);
    }
  } catch (err: any) {
    meepoLog.error("Auto-sleep check failed", {
      event_type: "AUTO_SLEEP",
      error: String(err?.message ?? err ?? "unknown_error"),
    });
  }

  return evaluations;
}

/**
 * Check for inactive Meepo instances and auto-sleep them.
 */
function checkInactivity() {
  runAutoSleepCheck(Date.now());
}

/**
 * Start the auto-sleep checker.
 * Safe to call multiple times (idempotent).
 */
export function startAutoSleepChecker() {
  if (checkInterval) {
    meepoLog.warn("Checker already running");
    return;
  }

  if (AUTO_SLEEP_MS <= 0) {
    meepoLog.debug("Disabled (MEEPO_AUTO_SLEEP_MS <= 0)");
    return;
  }

  meepoLog.info(`Starting checker (timeout: ${AUTO_SLEEP_MS / 60000} minutes, check interval: ${CHECK_INTERVAL_MS / 1000}s)`);

  checkInterval = setInterval(checkInactivity, CHECK_INTERVAL_MS);
}

/**
 * Stop the auto-sleep checker.
 */
export function stopAutoSleepChecker() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    meepoLog.debug("Checker stopped");
  }
}
