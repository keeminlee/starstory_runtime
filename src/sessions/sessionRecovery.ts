import { resolveCampaignSlug } from "../campaign/guildConfig.js";
import { getDbForCampaign } from "../db.js";
import { log } from "../utils/logger.js";

const bootLog = log.withScope("boot");

export type SessionRecoveryRow = {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
};

export type SessionRecoverySummary = {
  totalGuilds: number;
  scannedActiveSessions: number;
  interruptedSessions: number;
  rows: SessionRecoveryRow[];
};

export function recoverInterruptedSessions(guildIds: string[]): SessionRecoverySummary {
  bootLog.info("[BOOT] Recovering interrupted sessions...", {
    total_guilds: guildIds.length,
  });

  const rows: SessionRecoveryRow[] = [];
  let scannedActiveSessions = 0;

  for (const guildId of guildIds) {
    const campaignSlug = resolveCampaignSlug({ guildId });
    const db = getDbForCampaign(campaignSlug);

    const activeRows = db
      .prepare(
        `
        SELECT session_id
        FROM sessions
        WHERE guild_id = ?
          AND status = 'active'
        ORDER BY started_at_ms DESC
        `
      )
      .all(guildId) as Array<{ session_id: string }>;

    scannedActiveSessions += activeRows.length;

    for (const row of activeRows) {
      const now = Date.now();
      const updated = db
        .prepare(
          `
          UPDATE sessions
          SET
            status = 'interrupted',
            ended_at_ms = COALESCE(ended_at_ms, ?),
            ended_reason = CASE
              WHEN ended_reason IS NULL OR TRIM(ended_reason) = '' THEN ?
              ELSE ended_reason
            END
          WHERE session_id = ?
            AND guild_id = ?
            AND status = 'active'
          `
        )
        .run(now, "boot_recovery_interrupted", row.session_id, guildId);

      if (updated.changes > 0) {
        const recovered: SessionRecoveryRow = {
          guildId,
          campaignSlug,
          sessionId: row.session_id,
        };
        rows.push(recovered);

        bootLog.info(`[BOOT] Marked interrupted: session_id=${row.session_id}`, {
          guild_id: guildId,
          campaign_slug: campaignSlug,
          session_id: row.session_id,
        });
      }
    }
  }

  const summary: SessionRecoverySummary = {
    totalGuilds: guildIds.length,
    scannedActiveSessions,
    interruptedSessions: rows.length,
    rows,
  };

  bootLog.info("[BOOT] Recovery complete.", {
    total_guilds: summary.totalGuilds,
    scanned_active_sessions: summary.scannedActiveSessions,
    interrupted_sessions: summary.interruptedSessions,
  });

  return summary;
}
