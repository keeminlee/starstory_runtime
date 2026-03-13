// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test, vi } from "vitest";

process.env.DISCORD_TOKEN ??= "test-token";
process.env.OPENAI_API_KEY ??= "test-openai-key";

const tempDirs: string[] = [];

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("MIGRATIONS_SILENT", "1");
  vi.stubEnv("DEFAULT_CAMPAIGN_SLUG", "default");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore transient Windows file locks during cleanup.
    }
  }
});

describe("guild_seen_discord_users", () => {
  test("bootstraps table and round-trips upsert/list data", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-seen-users-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { getControlDb } = await import("../db.js");
    const {
      listGuildSeenDiscordUsers,
      upsertGuildSeenDiscordUser,
    } = await import("../campaign/guildSeenDiscordUsers.js");

    const db = getControlDb();
    const tableRow = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'guild_seen_discord_users'")
      .get() as { name: string } | undefined;
    expect(tableRow?.name).toBe("guild_seen_discord_users");

    upsertGuildSeenDiscordUser({
      guildId: "guild-1",
      discordUserId: "user-2",
      nickname: "Bravo",
      username: null,
      seenAtMs: 20,
    });
    upsertGuildSeenDiscordUser({
      guildId: "guild-1",
      discordUserId: "user-1",
      nickname: "Alpha",
      username: "alpha_user",
      seenAtMs: 10,
    });
    upsertGuildSeenDiscordUser({
      guildId: "guild-1",
      discordUserId: "user-1",
      nickname: "Alpha Prime",
      username: "alpha_user",
      seenAtMs: 30,
    });

    expect(listGuildSeenDiscordUsers({ guildId: "guild-1" })).toEqual([
      {
        guildId: "guild-1",
        discordUserId: "user-1",
        lastKnownNickname: "Alpha Prime",
        lastKnownUsername: "alpha_user",
        lastSeenAtMs: 30,
      },
      {
        guildId: "guild-1",
        discordUserId: "user-2",
        lastKnownNickname: "Bravo",
        lastKnownUsername: null,
        lastSeenAtMs: 20,
      },
    ]);
  });

  test("migrates older seen-user tables by adding username fallback column", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-seen-users-migrate-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const controlDir = path.join(tempDir, "control");
    fs.mkdirSync(controlDir, { recursive: true });
    const legacyDbPath = path.join(controlDir, "control.sqlite");
    const legacyDb = new Database(legacyDbPath);
    legacyDb.exec(`
      CREATE TABLE guild_seen_discord_users (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        last_known_nickname TEXT NOT NULL,
        last_seen_at_ms INTEGER NOT NULL,
        PRIMARY KEY (guild_id, discord_user_id)
      );
    `);
    legacyDb.close();

    const { getControlDb } = await import("../db.js");
    const db = getControlDb();
    const columns = db.prepare("PRAGMA table_info(guild_seen_discord_users)").all() as Array<{ name: string }>;

    expect(columns.some((column) => column.name === "last_known_username")).toBe(true);
  });
});