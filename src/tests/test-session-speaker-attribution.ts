import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { ensureRegistryScaffold, getRegistryDirForScope } from "../registry/scaffold.js";

const tempDirs: string[] = [];

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
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
      // Best-effort cleanup on Windows.
    }
  }
});

async function seedSessionFixture(guildId: string, sessionId: string, campaignSlugOverride?: string): Promise<void> {
  const { resolveCampaignSlug } = await import("../campaign/guildConfig.js");
  const { getDbForCampaignScope } = await import("../db.js");
  const campaignSlug = campaignSlugOverride ?? resolveCampaignSlug({ guildId });
  const db = getDbForCampaignScope({ guildId, campaignSlug });
  const now = Date.now();

  db.prepare(
    `
      INSERT INTO sessions (
        session_id, guild_id, kind, mode_at_start, status, label,
        created_at_ms, started_at_ms, ended_at_ms, ended_reason,
        started_by_id, started_by_name, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    sessionId,
    guildId,
    "canon",
    "canon",
    "completed",
    "Speaker Attribution Test",
    now - 10_000,
    now - 9_000,
    now - 1_000,
    "test_end",
    "dm-1",
    "Caterson",
    "live"
  );

  db.prepare(
    `
      INSERT INTO ledger_entries (
        id, guild_id, channel_id, message_id, author_id, author_name,
        timestamp_ms, content, content_norm, session_id, tags,
        source, narrative_weight, speaker_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    `${sessionId}-entry-1`,
    guildId,
    "channel-1",
    `${sessionId}-msg-1`,
    "player-1",
    "Jamison",
    now - 8_000,
    "I check the archway.",
    "I check the archway.",
    sessionId,
    "human",
    "text",
    "primary",
    null,
  );

  db.prepare(
    `
      INSERT INTO ledger_entries (
        id, guild_id, channel_id, message_id, author_id, author_name,
        timestamp_ms, content, content_norm, session_id, tags,
        source, narrative_weight, speaker_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    `${sessionId}-entry-2`,
    guildId,
    "channel-1",
    `${sessionId}-msg-2`,
    "stt-bot",
    "Caterson",
    now - 7_000,
    "The door grinds open.",
    "The door grinds open.",
    sessionId,
    "human",
    "voice",
    "primary",
    "dm-1",
  );

  db.prepare(
    `
      INSERT INTO ledger_entries (
        id, guild_id, channel_id, message_id, author_id, author_name,
        timestamp_ms, content, content_norm, session_id, tags,
        source, narrative_weight, speaker_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    `${sessionId}-entry-system`,
    guildId,
    "channel-1",
    `${sessionId}-msg-system`,
    "system",
    "SYSTEM",
    now - 6_000,
    JSON.stringify({ readiness: "pending" }),
    null,
    sessionId,
    "system,SESSION_RECAP_STATUS",
    "system",
    "secondary",
    null,
  );

  db.prepare(
    `
      INSERT INTO ledger_entries (
        id, guild_id, channel_id, message_id, author_id, author_name,
        timestamp_ms, content, content_norm, session_id, tags,
        source, narrative_weight, speaker_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    `${sessionId}-entry-secondary`,
    guildId,
    "channel-1",
    `${sessionId}-msg-secondary`,
    "spectator-1",
    "Viewer123",
    now - 5_000,
    "Can you hear me?",
    "Can you hear me?",
    sessionId,
    "human",
    "text",
    "secondary",
    null,
  );
}

function seedPcRegistry(guildId: string, campaignSlug: string): void {
  const registryDir = getRegistryDirForScope({ guildId, campaignSlug });
  ensureRegistryScaffold(registryDir);
  fs.writeFileSync(
    path.join(registryDir, "pcs.yml"),
    [
      "version: 1",
      "",
      "characters:",
      "  - id: pc_jamison",
      "    canonical_name: Jamison",
      "    aliases:",
      "      - Jami",
      "    discord_user_id: player-1",
      "    notes: Scout",
      "",
    ].join("\n"),
    "utf8"
  );
}

test("getSessionSpeakers uses only primary transcript rows and resolves voice speaker_id", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-speaker-extract-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-speaker-extract";
  const sessionId = "session-speaker-extract";
  await seedSessionFixture(guildId, sessionId);

  const { getSessionSpeakers } = await import("../sessions/sessionSpeakerAttribution.js");
  const speakers = getSessionSpeakers({ guildId, sessionId });

  expect(speakers).toEqual([
    expect.objectContaining({ discordUserId: "player-1", displayName: "Jamison" }),
    expect.objectContaining({ discordUserId: "dm-1", displayName: "Caterson" }),
  ]);
});

test("speaker attribution state auto-locks DM and becomes ready once non-DM speakers are classified", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-speaker-ready-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-speaker-ready";
  const sessionId = "session-speaker-ready";
  await seedSessionFixture(guildId, sessionId);

  const { setGuildDmUserId } = await import("../campaign/guildConfig.js");
  const {
    getSessionSpeakerAttributionState,
    setSessionSpeakerClassifications,
  } = await import("../sessions/sessionSpeakerAttribution.js");

  setGuildDmUserId(guildId, "dm-1");
  setSessionSpeakerClassifications({
    guildId,
    sessionId,
    entries: [{ discordUserId: "player-1", classificationType: "ignore" }],
  });

  const state = getSessionSpeakerAttributionState({ guildId, sessionId });
  expect(state.ready).toBe(true);
  expect(state.pendingCount).toBe(0);
  expect(state.speakers.find((speaker) => speaker.discordUserId === "dm-1")?.classification).toMatchObject({
    classificationType: "dm",
    locked: true,
    source: "auto_dm",
  });
});

test("speaker attribution stores validated PC mappings and rejects invalid PC classifications", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-speaker-pc-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-speaker-pc";
  const sessionId = "session-speaker-pc";
  const campaignSlug = "default";
  await seedSessionFixture(guildId, sessionId, campaignSlug);
  seedPcRegistry(guildId, campaignSlug);

  const { setGuildDmUserId } = await import("../campaign/guildConfig.js");
  const {
    getSessionSpeakerClassifications,
    setSessionSpeakerClassifications,
  } = await import("../sessions/sessionSpeakerAttribution.js");

  setGuildDmUserId(guildId, "dm-1");

  await expect(
    Promise.resolve().then(() =>
      setSessionSpeakerClassifications({
        guildId,
        campaignSlug,
        sessionId,
        entries: [{ discordUserId: "player-1", classificationType: "pc" }],
      })
    )
  ).rejects.toThrow(/pcEntityId is required/i);

  setSessionSpeakerClassifications({
    guildId,
    campaignSlug,
    sessionId,
    entries: [{ discordUserId: "player-1", classificationType: "pc", pcEntityId: "pc_jamison" }],
  });

  const stored = getSessionSpeakerClassifications({ guildId, campaignSlug, sessionId });
  expect(stored).toEqual([
    expect.objectContaining({
      discordUserId: "player-1",
      classificationType: "pc",
      pcEntityId: "pc_jamison",
    }),
  ]);
});

test("speaker attribution state treats missing registry PCs as unresolved before recap", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-speaker-stale-pc-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-speaker-stale-pc";
  const sessionId = "session-speaker-stale-pc";
  const campaignSlug = "default";
  await seedSessionFixture(guildId, sessionId, campaignSlug);
  seedPcRegistry(guildId, campaignSlug);

  const { setGuildDmUserId } = await import("../campaign/guildConfig.js");
  const {
    getSessionSpeakerAttributionState,
    setSessionSpeakerClassifications,
  } = await import("../sessions/sessionSpeakerAttribution.js");

  setGuildDmUserId(guildId, "dm-1");
  setSessionSpeakerClassifications({
    guildId,
    campaignSlug,
    sessionId,
    entries: [{ discordUserId: "player-1", classificationType: "pc", pcEntityId: "pc_jamison" }],
  });

  const registryDir = getRegistryDirForScope({ guildId, campaignSlug });
  fs.writeFileSync(path.join(registryDir, "pcs.yml"), "version: 1\ncharacters: []\n", "utf8");

  const state = getSessionSpeakerAttributionState({ guildId, campaignSlug, sessionId });
  expect(state.ready).toBe(false);
  expect(state.pendingCount).toBe(1);
  expect(state.speakers.find((speaker) => speaker.discordUserId === "player-1")?.classification).toBeNull();
});

test("registry scope paths remain rooted at repo data when cwd is apps/web", () => {
  vi.unstubAllEnvs();

  const originalCwd = process.cwd();
  const webCwd = path.join(originalCwd, "apps", "web");

  process.chdir(webCwd);
  try {
    expect(getRegistryDirForScope({ guildId: "Guild-1", campaignSlug: "Default" })).toBe(
      path.join(originalCwd, "data", "registry", "g_guild-1__c_default")
    );
  } finally {
    process.chdir(originalCwd);
  }
});