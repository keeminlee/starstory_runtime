import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

type GuildMetadataRow = {
  guild_id: string;
  guild_name: string;
  guild_icon: string | null;
  updated_at_ms: number;
  last_seen_at_ms: number | null;
};

export type DiscordGuildDisplayMetadata = {
  guildId: string;
  guildName: string;
  guildIcon?: string | null;
  updatedAtMs: number;
  lastSeenAtMs?: number | null;
};

const dbCache = new Map<string, Database.Database>();
const ensuredTableByDbPath = new Set<string>();

function resolveDataRoot(): string {
  const explicitRoot = process.env.DATA_ROOT?.trim();
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }

  const candidateRoots = [
    path.resolve(process.cwd(), "..", "..", "data"),
    path.resolve(process.cwd(), "data"),
  ];

  function scoreDataRoot(root: string): number {
    if (!fs.existsSync(root)) return -1;

    let score = 0;
    if (fs.existsSync(path.join(root, "campaigns"))) score += 4;
    if (fs.existsSync(path.join(root, "control", "control.sqlite"))) score += 4;
    if (fs.existsSync(path.join(root, "bot.sqlite"))) score += 2;
    return score;
  }

  let bestRoot = candidateRoots[0];
  let bestScore = scoreDataRoot(bestRoot);

  for (const root of candidateRoots.slice(1)) {
    const score = scoreDataRoot(root);
    if (score > bestScore) {
      bestRoot = root;
      bestScore = score;
    }
  }

  return bestRoot;
}

function getControlDbPath(): string {
  return path.join(resolveDataRoot(), "control", "control.sqlite");
}

function getControlDb(): { db: Database.Database; dbPath: string } {
  const dbPath = getControlDbPath();
  const cached = dbCache.get(dbPath);
  if (cached) {
    return { db: cached, dbPath };
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  dbCache.set(dbPath, db);
  return { db, dbPath };
}

function ensureGuildMetadataTable(db: {
  exec: (sql: string) => void;
}, dbPath: string): void {
  if (ensuredTableByDbPath.has(dbPath)) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS discord_guild_metadata (
      guild_id TEXT PRIMARY KEY,
      guild_name TEXT NOT NULL,
      guild_icon TEXT,
      updated_at_ms INTEGER NOT NULL,
      last_seen_at_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_discord_guild_metadata_updated
    ON discord_guild_metadata(updated_at_ms DESC);

    CREATE INDEX IF NOT EXISTS idx_discord_guild_metadata_last_seen
    ON discord_guild_metadata(last_seen_at_ms DESC);
  `);

  ensuredTableByDbPath.add(dbPath);
}

function dedupeGuildMetadata(guilds: DiscordGuildDisplayMetadata[]): DiscordGuildDisplayMetadata[] {
  const seen = new Set<string>();
  const out: DiscordGuildDisplayMetadata[] = [];

  for (const guild of guilds) {
    const guildId = guild.guildId.trim();
    const guildName = guild.guildName.trim();
    if (!guildId || !guildName || seen.has(guildId)) continue;
    seen.add(guildId);

    out.push({
      guildId,
      guildName,
      ...(guild.guildIcon !== undefined ? { guildIcon: guild.guildIcon } : {}),
      updatedAtMs: guild.updatedAtMs,
      ...(guild.lastSeenAtMs !== undefined ? { lastSeenAtMs: guild.lastSeenAtMs } : {}),
    });
  }

  return out;
}

export async function upsertGuildDisplayMetadata(args: {
  guilds: DiscordGuildDisplayMetadata[];
  nowMs?: number;
}): Promise<void> {
  const { db, dbPath } = getControlDb();
  ensureGuildMetadataTable(db, dbPath);

  const nowMs = args.nowMs ?? Date.now();
  const guilds = dedupeGuildMetadata(
    args.guilds.map((guild) => ({
      ...guild,
      updatedAtMs: Number.isFinite(guild.updatedAtMs) ? guild.updatedAtMs : nowMs,
      lastSeenAtMs: guild.lastSeenAtMs ?? nowMs,
    }))
  );

  if (guilds.length === 0) return;

  const statement = db.prepare(`
    INSERT INTO discord_guild_metadata (guild_id, guild_name, guild_icon, updated_at_ms, last_seen_at_ms)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id)
    DO UPDATE SET
      guild_name = excluded.guild_name,
      guild_icon = excluded.guild_icon,
      updated_at_ms = excluded.updated_at_ms,
      last_seen_at_ms = excluded.last_seen_at_ms
  `);

  const transaction = db.transaction((rows: DiscordGuildDisplayMetadata[]) => {
    for (const row of rows) {
      statement.run(
        row.guildId,
        row.guildName,
        row.guildIcon ?? null,
        row.updatedAtMs,
        row.lastSeenAtMs ?? null
      );
    }
  });

  transaction(guilds);
}

export async function getGuildDisplayMetadataByIds(args: {
  guildIds: string[];
}): Promise<DiscordGuildDisplayMetadata[]> {
  const guildIds = Array.from(new Set(args.guildIds.map((id) => id.trim()).filter(Boolean)));
  if (guildIds.length === 0) return [];

  const { db, dbPath } = getControlDb();
  ensureGuildMetadataTable(db, dbPath);

  const placeholders = guildIds.map(() => "?").join(", ");
  const query = db.prepare(
    `SELECT guild_id, guild_name, guild_icon, updated_at_ms, last_seen_at_ms
     FROM discord_guild_metadata
     WHERE guild_id IN (${placeholders})`
  );

  const rows = query.all(...guildIds) as GuildMetadataRow[];
  return rows.map((row) => ({
    guildId: row.guild_id,
    guildName: row.guild_name,
    ...(row.guild_icon !== null ? { guildIcon: row.guild_icon } : {}),
    updatedAtMs: row.updated_at_ms,
    ...(row.last_seen_at_ms !== null ? { lastSeenAtMs: row.last_seen_at_ms } : {}),
  }));
}

export async function hasFreshGuildDisplayMetadata(args: {
  guildIds: string[];
  maxAgeMs: number;
  nowMs?: number;
}): Promise<boolean> {
  const guildIds = Array.from(new Set(args.guildIds.map((id) => id.trim()).filter(Boolean)));
  if (guildIds.length === 0) return true;

  const nowMs = args.nowMs ?? Date.now();
  const minUpdatedAtMs = nowMs - Math.max(1_000, Math.floor(args.maxAgeMs));

  const { db, dbPath } = getControlDb();
  ensureGuildMetadataTable(db, dbPath);

  const placeholders = guildIds.map(() => "?").join(", ");
  const query = db.prepare(
    `SELECT COUNT(*) as total
     FROM discord_guild_metadata
     WHERE guild_id IN (${placeholders})
       AND updated_at_ms >= ?`
  );

  const row = query.get(...guildIds, minUpdatedAtMs) as { total?: number };
  return Number(row.total ?? 0) === guildIds.length;
}
