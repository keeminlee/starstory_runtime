import { getControlDb } from "../db.js";

export type ResetAwakeningReport = {
  deleted_onboarding_rows: number;
  cleared_awakened_flag: boolean;
  notes: string[];
};

function tableExists(db: any, tableName: string): boolean {
  const row = db
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { present: number } | undefined;
  return Boolean(row?.present);
}

function deleteGuildRowsIfTableExists(args: { db: any; tableName: string; guildId: string }): number {
  if (!tableExists(args.db, args.tableName)) {
    return 0;
  }

  const result = args.db
    .prepare(`DELETE FROM ${args.tableName} WHERE guild_id = ?`)
    .run(args.guildId) as { changes?: number };

  return Number(result?.changes ?? 0);
}

export function resetAwakeningForGuild(
  guildId: string,
  opts?: { db?: any; controlDb?: any }
): ResetAwakeningReport {
  const db = opts?.db;
  if (!db) {
    throw new Error("resetAwakeningForGuild requires opts.db");
  }

  const notes: string[] = [];
  const deletedCurrentRows = deleteGuildRowsIfTableExists({
    db,
    tableName: "guild_onboarding_state",
    guildId,
  });
  const deletedLegacyRows = deleteGuildRowsIfTableExists({
    db,
    tableName: "onboarding_progress",
    guildId,
  });

  if (!tableExists(db, "onboarding_progress")) {
    notes.push("legacy onboarding_progress table not present");
  }

  const controlDb = opts?.controlDb ?? getControlDb();
  let clearedAwakenedFlag = false;
  if (tableExists(controlDb, "guild_config")) {
    const result = controlDb
      .prepare("UPDATE guild_config SET awakened = 0 WHERE guild_id = ? AND awakened = 1")
      .run(guildId) as { changes?: number };
    clearedAwakenedFlag = Number(result?.changes ?? 0) > 0;
  } else {
    notes.push("guild_config table not present");
  }

  return {
    deleted_onboarding_rows: deletedCurrentRows + deletedLegacyRows,
    cleared_awakened_flag: clearedAwakenedFlag,
    notes,
  };
}
