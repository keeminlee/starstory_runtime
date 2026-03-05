import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

let configuredDmUserId: string | null = "dm-user";

const runWakeMock = vi.fn(async () => ({
  status: "blocked" as const,
  reason: "budget" as const,
  sceneId: "done_stub",
  emittedBeatCount: 0,
}));

vi.mock("../awakening/AwakenEngine.js", () => ({
  AwakenEngine: {
    runWake: runWakeMock,
  },
}));

vi.mock("../security/isElevated.js", () => ({
  isElevated: vi.fn(() => true),
}));

vi.mock("../campaign/guildConfig.js", () => ({
  getGuildCanonPersonaId: vi.fn(() => null),
  getGuildCanonPersonaMode: vi.fn(() => "meta"),
  getGuildConfig: vi.fn(() => ({ campaign_slug: "default" })),
  getGuildDmUserId: vi.fn(() => configuredDmUserId),
  getGuildDefaultRecapStyle: vi.fn(() => "balanced"),
  getGuildHomeTextChannelId: vi.fn(() => null),
  getGuildHomeVoiceChannelId: vi.fn(() => null),
  getGuildSetupVersion: vi.fn(() => 1),
  resolveGuildHomeVoiceChannelId: vi.fn(() => null),
  setGuildCanonPersonaId: vi.fn(),
  setGuildCanonPersonaMode: vi.fn(),
  setGuildDefaultRecapStyle: vi.fn(),
  setGuildDmUserId: vi.fn(),
  setGuildHomeTextChannelId: vi.fn(),
  setGuildHomeVoiceChannelId: vi.fn(),
}));

const tempDirs: string[] = [];

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
  vi.stubEnv("MIGRATIONS_SILENT", "1");
}

function buildInteraction(args: {
  response: string;
  userId: string;
  hasManageGuild?: boolean;
}) {
  const reply = vi.fn(async (_payload: { content: string; ephemeral: boolean }) => undefined);
  return {
    interaction: {
      guildId: "guild-1",
      channelId: "channel-1",
      guild: {},
      member: {},
      memberPermissions: {
        has: vi.fn(() => Boolean(args.hasManageGuild)),
      },
      user: { id: args.userId, username: "Tester" },
      deferred: false,
      replied: false,
      options: {
        getSubcommandGroup: vi.fn(() => null),
        getSubcommand: vi.fn(() => "wake"),
        getString: vi.fn((name: string) => {
          if (name === "response") return args.response;
          return null;
        }),
      },
      reply,
    },
    reply,
  };
}

function getIdentityMemoryRowCount(db: any): number {
  const row = db.prepare("SELECT COUNT(*) as n FROM meepo_mind_memory").get() as { n: number };
  return row.n;
}

afterEach(() => {
  configuredDmUserId = "dm-user";
  runWakeMock.mockClear();
  vi.unstubAllEnvs();
  vi.resetModules();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore transient Windows file lock cleanup failures in test teardown.
      }
    }
  }
});

describe("/meepo wake response strict gating", () => {
  test("Case A: rejects when onboarding state is missing", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-wake-gating-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { meepo } = await import("../commands/meepo.js");
    const { getDbForCampaign } = await import("../db.js");

    const db = getDbForCampaign("default");
    const { interaction, reply } = buildInteraction({
      response: "Keemin",
      userId: "dm-user",
    });

    await meepo.execute(interaction, {
      guildId: "guild-1",
      campaignSlug: "default",
      dbPath: "test.sqlite",
      db,
    });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toEqual({
      content: "No pending text prompt.",
      ephemeral: true,
    });
    expect(getIdentityMemoryRowCount(db)).toBe(0);
    expect(runWakeMock).not.toHaveBeenCalled();
    db.close();
  });

  test("Case B: rejects when state exists but no matching await_input", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-wake-gating-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { meepo } = await import("../commands/meepo.js");
    const { getDbForCampaign } = await import("../db.js");
    const { initState } = await import("../ledger/awakeningStateRepo.js");

    const db = getDbForCampaign("default");
    initState("guild-1", "meepo_awaken", 1, "cold_open", { db });

    const { interaction, reply } = buildInteraction({
      response: "Keemin",
      userId: "dm-user",
    });

    await meepo.execute(interaction, {
      guildId: "guild-1",
      campaignSlug: "default",
      dbPath: "test.sqlite",
      db,
    });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toEqual({
      content: "No pending text prompt.",
      ephemeral: true,
    });
    expect(getIdentityMemoryRowCount(db)).toBe(0);
    expect(runWakeMock).not.toHaveBeenCalled();
    db.close();
  });

  test("Case C: rejects non-DM caller when dm_display_name input is pending", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-wake-gating-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { meepo } = await import("../commands/meepo.js");
    const { getDbForCampaign } = await import("../db.js");
    const { initState, saveProgress } = await import("../ledger/awakeningStateRepo.js");

    const db = getDbForCampaign("default");
    initState("guild-1", "meepo_awaken", 1, "ask_dm_name", { db });
    saveProgress("guild-1", "meepo_awaken", {
      await_input: { key: "dm_display_name", kind: "modal_text" },
      pending_prompt_kind: "modal_text",
      pending_prompt_key: "dm_display_name",
      pending_prompt_scene_id: "ask_dm_name",
      pending_prompt_nonce: "nonce-1",
    }, { db });

    const { interaction, reply } = buildInteraction({
      response: "Keemin",
      userId: "not-dm",
      hasManageGuild: false,
    });

    await meepo.execute(interaction, {
      guildId: "guild-1",
      campaignSlug: "default",
      dbPath: "test.sqlite",
      db,
    });

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toEqual({
      content: "Only the Dungeon Master can answer this awakening prompt.",
      ephemeral: true,
    });
    expect(getIdentityMemoryRowCount(db)).toBe(0);
    expect(runWakeMock).not.toHaveBeenCalled();
    db.close();
  });

  test("Case D: accepts DM response, persists input, and second call rejects", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-wake-gating-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { meepo } = await import("../commands/meepo.js");
    const { getDbForCampaign } = await import("../db.js");
    const { initState, loadState, saveProgress } = await import("../ledger/awakeningStateRepo.js");

    const db = getDbForCampaign("default");
    initState("guild-1", "meepo_awaken", 1, "ask_dm_name", { db });
    saveProgress("guild-1", "meepo_awaken", {
      await_input: { key: "dm_display_name", kind: "modal_text" },
      pending_prompt_kind: "modal_text",
      pending_prompt_key: "dm_display_name",
      pending_prompt_scene_id: "ask_dm_name",
      pending_prompt_nonce: "nonce-1",
    }, { db });

    const first = buildInteraction({
      response: "ZZZ_TEST_DM_NAME",
      userId: "dm-user",
      hasManageGuild: false,
    });

    await meepo.execute(first.interaction, {
      guildId: "guild-1",
      campaignSlug: "default",
      dbPath: "test.sqlite",
      db,
    });

    const state = loadState("guild-1", "meepo_awaken", { db });
    expect(state?.progress_json.dm_display_name).toBe("ZZZ_TEST_DM_NAME");
    expect(state?.progress_json.await_input).toBeNull();
    expect(state?.current_scene).toBe("ask_dm_name");
    expect(getIdentityMemoryRowCount(db)).toBe(1);

    const second = buildInteraction({
      response: "ZZZ_TEST_DM_NAME",
      userId: "dm-user",
      hasManageGuild: false,
    });

    await meepo.execute(second.interaction, {
      guildId: "guild-1",
      campaignSlug: "default",
      dbPath: "test.sqlite",
      db,
    });

    expect(second.reply).toHaveBeenCalledWith({
      content: "No pending text prompt.",
      ephemeral: true,
    });
    expect(getIdentityMemoryRowCount(db)).toBe(1);
    db.close();
  });
});
