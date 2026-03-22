import { getDbForCampaign } from "../db.js";

export const MIN_SESSION_VALIDATION_LINE_COUNT = 100;

export type SessionValidationOutcome = "success" | "failure";

export type SessionValidationResult = {
  sessionId: string;
  guildId: string;
  campaignSlug: string;
  outcome: SessionValidationOutcome;
  lineCount: number;
  minLineCount: number;
  durationMs: number | null;
  minDurationMs: number | null;
  reason: string | null;
  validatedAtMs: number;
};

type SessionRow = {
  started_at_ms: number;
  ended_at_ms: number | null;
};

type SessionValidationRow = {
  session_id: string;
  guild_id: string;
  campaign_slug: string | null;
  outcome: SessionValidationOutcome;
  line_count: number;
  min_line_count: number;
  duration_ms: number | null;
  min_duration_ms: number | null;
  reason: string | null;
  validated_at_ms: number;
};

function readSessionRow(db: any, guildId: string, sessionId: string): SessionRow {
  const row = db
    .prepare(
      `SELECT started_at_ms, ended_at_ms
       FROM sessions
       WHERE guild_id = ? AND session_id = ?
       LIMIT 1`
    )
    .get(guildId, sessionId) as SessionRow | undefined;

  if (!row) {
    throw new Error(`Cannot validate missing session ${sessionId} for guild ${guildId}.`);
  }

  return row;
}

function readBronzeLineCount(db: any, sessionId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM bronze_transcript
       WHERE session_id = ?`
    )
    .get(sessionId) as { count: number } | undefined;

  return Math.max(0, Number(row?.count ?? 0));
}

function readPersistedValidation(db: any, sessionId: string): SessionValidationRow | null {
  const row = db
    .prepare(
      `SELECT session_id, guild_id, campaign_slug, outcome, line_count, min_line_count,
              duration_ms, min_duration_ms, reason, validated_at_ms
       FROM session_validation
       WHERE session_id = ?
       LIMIT 1`
    )
    .get(sessionId) as SessionValidationRow | undefined;

  return row ?? null;
}

export function getSessionValidation(args: {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
  db?: any;
}): SessionValidationResult | null {
  const db = args.db ?? getDbForCampaign(args.campaignSlug);
  const row = readPersistedValidation(db, args.sessionId);
  if (!row || row.guild_id !== args.guildId) {
    return null;
  }

  return {
    sessionId: row.session_id,
    guildId: row.guild_id,
    campaignSlug: row.campaign_slug ?? args.campaignSlug,
    outcome: row.outcome,
    lineCount: row.line_count,
    minLineCount: row.min_line_count,
    durationMs: row.duration_ms,
    minDurationMs: row.min_duration_ms,
    reason: row.reason,
    validatedAtMs: row.validated_at_ms,
  };
}

export function validateSessionCompletion(args: {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
  db?: any;
  nowMs?: number;
  minLineCount?: number;
  minDurationMs?: number | null;
}): SessionValidationResult {
  const db = args.db ?? getDbForCampaign(args.campaignSlug);
  const nowMs = args.nowMs ?? Date.now();
  const minLineCount = Math.max(1, Math.floor(args.minLineCount ?? MIN_SESSION_VALIDATION_LINE_COUNT));
  const minDurationMs = args.minDurationMs == null ? null : Math.max(0, Math.floor(args.minDurationMs));

  const session = readSessionRow(db, args.guildId, args.sessionId);
  const lineCount = readBronzeLineCount(db, args.sessionId);
  const durationMs = typeof session.ended_at_ms === "number"
    ? Math.max(0, session.ended_at_ms - session.started_at_ms)
    : null;

  let outcome: SessionValidationOutcome = "success";
  let reason: string | null = null;

  if (lineCount < minLineCount) {
    outcome = "failure";
    reason = "insufficient_transcript_lines";
  } else if (minDurationMs !== null && durationMs !== null && durationMs < minDurationMs) {
    outcome = "failure";
    reason = "duration_below_minimum";
  }

  db.prepare(
    `INSERT INTO session_validation (
       session_id,
       guild_id,
       campaign_slug,
       outcome,
       line_count,
       min_line_count,
       duration_ms,
       min_duration_ms,
       reason,
       validated_at_ms
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id)
     DO UPDATE SET
       guild_id = excluded.guild_id,
       campaign_slug = excluded.campaign_slug,
       outcome = excluded.outcome,
       line_count = excluded.line_count,
       min_line_count = excluded.min_line_count,
       duration_ms = excluded.duration_ms,
       min_duration_ms = excluded.min_duration_ms,
       reason = excluded.reason,
       validated_at_ms = excluded.validated_at_ms`
  ).run(
    args.sessionId,
    args.guildId,
    args.campaignSlug,
    outcome,
    lineCount,
    minLineCount,
    durationMs,
    minDurationMs,
    reason,
    nowMs,
  );

  return {
    sessionId: args.sessionId,
    guildId: args.guildId,
    campaignSlug: args.campaignSlug,
    outcome,
    lineCount,
    minLineCount,
    durationMs,
    minDurationMs,
    reason,
    validatedAtMs: nowMs,
  };
}
