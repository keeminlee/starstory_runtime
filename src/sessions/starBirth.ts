import { getShowtimeCampaignBySlug } from "../campaign/showtimeCampaigns.js";
import { getDbForCampaignScope } from "../db.js";
import { getSessionValidation, validateSessionCompletion } from "./sessionValidation.js";

type SessionBirthRow = {
  label: string | null;
};

type BornStarRow = {
  session_id: string;
  guild_id: string;
  campaign_slug: string;
  campaign_name: string | null;
  session_label: string | null;
  born_at_ms: number;
  validated_at_ms: number;
  line_count: number;
};

export type BornStarRecord = {
  sessionId: string;
  guildId: string;
  campaignSlug: string;
  campaignName: string | null;
  sessionLabel: string | null;
  bornAtMs: number;
  validatedAtMs: number;
  lineCount: number;
};

export type MaterializeBornStarResult = {
  created: boolean;
  record: BornStarRecord | null;
  reason?: "validation_not_successful" | "validation_missing";
};

export type RepairMissingBornStarsResult = {
  scannedSessionCount: number;
  createdCount: number;
  repairedSessionIds: string[];
};

function toBornStarRecord(row: BornStarRow): BornStarRecord {
  return {
    sessionId: row.session_id,
    guildId: row.guild_id,
    campaignSlug: row.campaign_slug,
    campaignName: row.campaign_name,
    sessionLabel: row.session_label,
    bornAtMs: row.born_at_ms,
    validatedAtMs: row.validated_at_ms,
    lineCount: row.line_count,
  };
}

function readBornStarRow(db: any, sessionId: string): BornStarRow | null {
  const row = db
    .prepare(
      `SELECT session_id, guild_id, campaign_slug, campaign_name, session_label,
              born_at_ms, validated_at_ms, line_count
       FROM born_stars
       WHERE session_id = ?
       LIMIT 1`
    )
    .get(sessionId) as BornStarRow | undefined;

  return row ?? null;
}

function readSessionBirthRow(db: any, guildId: string, sessionId: string): SessionBirthRow {
  const row = db
    .prepare(
      `SELECT label
       FROM sessions
       WHERE guild_id = ? AND session_id = ?
       LIMIT 1`
    )
    .get(guildId, sessionId) as SessionBirthRow | undefined;

  if (!row) {
    throw new Error(`Cannot materialize born star for missing session ${sessionId}.`);
  }

  return row;
}

export function getBornStarForSession(args: {
  campaignSlug: string;
  guildId?: string | null;
  sessionId: string;
  db?: any;
}): BornStarRecord | null {
  const db = args.db ?? getDbForCampaignScope({ guildId: args.guildId, campaignSlug: args.campaignSlug });
  const row = readBornStarRow(db, args.sessionId);
  return row ? toBornStarRecord(row) : null;
}

export function materializeBornStarForValidatedSession(args: {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
  db?: any;
  nowMs?: number;
}): MaterializeBornStarResult {
  const db = args.db ?? getDbForCampaignScope({ guildId: args.guildId, campaignSlug: args.campaignSlug });
  const existing = readBornStarRow(db, args.sessionId);
  if (existing) {
    return { created: false, record: toBornStarRecord(existing) };
  }

  const validation = getSessionValidation({
    guildId: args.guildId,
    campaignSlug: args.campaignSlug,
    sessionId: args.sessionId,
    db,
  });

  if (!validation) {
    return { created: false, record: null, reason: "validation_missing" };
  }

  if (validation.outcome !== "success") {
    return { created: false, record: null, reason: "validation_not_successful" };
  }

  const session = readSessionBirthRow(db, args.guildId, args.sessionId);
  const campaign = getShowtimeCampaignBySlug(args.guildId, args.campaignSlug);
  const bornAtMs = args.nowMs ?? Date.now();

  const insertResult = db.prepare(
    `INSERT OR IGNORE INTO born_stars (
       session_id,
       guild_id,
       campaign_slug,
       campaign_name,
       session_label,
       born_at_ms,
       validated_at_ms,
       line_count
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    args.sessionId,
    args.guildId,
    args.campaignSlug,
    campaign?.campaign_name ?? null,
    session.label?.trim() || null,
    bornAtMs,
    validation.validatedAtMs,
    validation.lineCount,
  );

  const row = readBornStarRow(db, args.sessionId);
  return {
    created: Number(insertResult.changes ?? 0) > 0,
    record: row ? toBornStarRecord(row) : null,
  };
}

function listRepairCandidateSessionIds(db: any, guildId: string): string[] {
  return db
    .prepare(
      `SELECT s.session_id
       FROM sessions s
       LEFT JOIN born_stars bs ON bs.session_id = s.session_id
       WHERE s.guild_id = ?
         AND s.ended_at_ms IS NOT NULL
         AND bs.session_id IS NULL
       ORDER BY s.started_at_ms ASC, s.session_id ASC`
    )
    .all(guildId)
    .map((row: { session_id: string }) => String(row.session_id));
}

export function repairMissingBornStarsForCampaignScope(args: {
  guildId: string;
  campaignSlug: string;
  db?: any;
  nowMs?: number;
  minLineCount?: number;
  minDurationMs?: number | null;
}): RepairMissingBornStarsResult {
  const db = args.db ?? getDbForCampaignScope({ guildId: args.guildId, campaignSlug: args.campaignSlug });
  const candidateSessionIds = listRepairCandidateSessionIds(db, args.guildId);
  const repairedSessionIds: string[] = [];

  for (const sessionId of candidateSessionIds) {
    const validation = validateSessionCompletion({
      guildId: args.guildId,
      campaignSlug: args.campaignSlug,
      sessionId,
      db,
      nowMs: args.nowMs,
      minLineCount: args.minLineCount,
      minDurationMs: args.minDurationMs,
    });

    if (validation.outcome !== "success") {
      continue;
    }

    const result = materializeBornStarForValidatedSession({
      guildId: args.guildId,
      campaignSlug: args.campaignSlug,
      sessionId,
      db,
      nowMs: args.nowMs,
    });

    if (result.created) {
      repairedSessionIds.push(sessionId);
    }
  }

  return {
    scannedSessionCount: candidateSessionIds.length,
    createdCount: repairedSessionIds.length,
    repairedSessionIds,
  };
}
