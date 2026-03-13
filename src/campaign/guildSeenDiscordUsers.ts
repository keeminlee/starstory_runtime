import { getControlDb } from "../db.js";

export type GuildSeenDiscordUserRow = {
  guildId: string;
  discordUserId: string;
  lastKnownNickname: string;
  lastKnownUsername: string | null;
  lastSeenAtMs: number;
};

type GuildSeenDiscordUserDbRow = {
  guild_id: string;
  discord_user_id: string;
  last_known_nickname: string;
  last_known_username: string | null;
  last_seen_at_ms: number;
};

function normalizeRequired(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return trimmed;
}

function normalizeOptional(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function mapRow(row: GuildSeenDiscordUserDbRow): GuildSeenDiscordUserRow {
  return {
    guildId: row.guild_id,
    discordUserId: row.discord_user_id,
    lastKnownNickname: row.last_known_nickname,
    lastKnownUsername: row.last_known_username,
    lastSeenAtMs: row.last_seen_at_ms,
  };
}

export function upsertGuildSeenDiscordUser(args: {
  guildId: string;
  discordUserId: string;
  nickname: string;
  username?: string | null;
  seenAtMs: number;
}): void {
  const guildId = normalizeRequired(args.guildId, "guildId");
  const discordUserId = normalizeRequired(args.discordUserId, "discordUserId");
  const nickname = normalizeRequired(args.nickname, "nickname");
  const username = normalizeOptional(args.username);
  const seenAtMs = Number(args.seenAtMs);
  if (!Number.isFinite(seenAtMs)) {
    throw new Error("seenAtMs must be a finite number");
  }

  const db = getControlDb();
  db.prepare(
    `INSERT INTO guild_seen_discord_users (
      guild_id,
      discord_user_id,
      last_known_nickname,
      last_known_username,
      last_seen_at_ms
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, discord_user_id) DO UPDATE SET
      last_known_nickname = excluded.last_known_nickname,
      last_known_username = excluded.last_known_username,
      last_seen_at_ms = excluded.last_seen_at_ms`
  ).run(guildId, discordUserId, nickname, username, Math.trunc(seenAtMs));
}

export function getGuildSeenDiscordUser(args: {
  guildId: string;
  discordUserId: string;
}): GuildSeenDiscordUserRow | null {
  const guildId = normalizeRequired(args.guildId, "guildId");
  const discordUserId = normalizeRequired(args.discordUserId, "discordUserId");

  const db = getControlDb();
  const row = db
    .prepare(
      `SELECT guild_id, discord_user_id, last_known_nickname, last_known_username, last_seen_at_ms
       FROM guild_seen_discord_users
       WHERE guild_id = ? AND discord_user_id = ?
       LIMIT 1`
    )
    .get(guildId, discordUserId) as GuildSeenDiscordUserDbRow | undefined;

  return row ? mapRow(row) : null;
}

export function listGuildSeenDiscordUsers(args: {
  guildId: string;
}): GuildSeenDiscordUserRow[] {
  const guildId = normalizeRequired(args.guildId, "guildId");
  const db = getControlDb();
  const rows = db
    .prepare(
      `SELECT guild_id, discord_user_id, last_known_nickname, last_known_username, last_seen_at_ms
       FROM guild_seen_discord_users
       WHERE guild_id = ?
       ORDER BY last_known_nickname COLLATE NOCASE ASC, last_seen_at_ms DESC, discord_user_id ASC`
    )
    .all(guildId) as GuildSeenDiscordUserDbRow[];

  return rows.map(mapRow);
}