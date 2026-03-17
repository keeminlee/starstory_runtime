import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { InteractionType } from "discord.js";
import { afterEach, describe, expect, test, vi } from "vitest";

process.env.DISCORD_TOKEN ??= "test-token";
process.env.OPENAI_API_KEY ??= "test-openai-key";

const tempDirs: string[] = [];
const joinVoiceMock = vi.fn();
const leaveVoiceMock = vi.fn();
const startReceiverMock = vi.fn();
const stopReceiverMock = vi.fn();
const overlayEmitPresenceMock = vi.fn();

let currentVoiceState: { channelId: string } | null = null;

const activeMeepoState = {
  current: {
    guild_id: "guild-1",
    channel_id: "text-1",
    created_at_ms: Date.now(),
  } as any,
};

vi.mock("../meepo/state.js", () => ({
  getActiveMeepo: vi.fn(() => activeMeepoState.current),
  wakeMeepo: vi.fn(() => undefined),
  sleepMeepo: vi.fn(() => true),
  transformMeepo: vi.fn(() => ({ success: true })),
}));

vi.mock("../voice/connection.js", () => ({
  joinVoice: joinVoiceMock,
  leaveVoice: leaveVoiceMock,
}));

vi.mock("../voice/receiver.js", () => ({
  startReceiver: startReceiverMock,
  stopReceiver: stopReceiverMock,
}));

vi.mock("../voice/state.js", () => ({
  getVoiceState: vi.fn(() => currentVoiceState),
  setVoiceState: vi.fn((_guildId: string, nextState: { channelId: string }) => {
    currentVoiceState = nextState;
  }),
  clearVoiceState: vi.fn(() => {
    currentVoiceState = null;
  }),
  isVoiceHushEnabled: vi.fn(() => true),
  setVoiceHushEnabled: vi.fn(),
}));

vi.mock("../overlay/server.js", () => ({
  overlayEmitPresence: overlayEmitPresenceMock,
}));

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("MIGRATIONS_SILENT", "1");
  vi.stubEnv("DEFAULT_CAMPAIGN_SLUG", "default");
}

function buildInteraction(args?: { subcommand?: string }) {
  return {
    type: InteractionType.ApplicationCommand,
    guildId: "guild-1",
    channelId: "channel-1",
    guild: {
      name: "Guild One",
      voiceAdapterCreator: {},
      members: {
        fetch: vi.fn(async () => ({
          voice: {
            channel: {
              id: "voice-1",
              name: "Table Talk",
            },
          },
        })),
      },
    },
    member: { voice: { channelId: "voice-1" } },
    memberPermissions: { has: vi.fn(() => true) },
    user: { id: "dm-user", username: "DM" },
    deferred: false,
    replied: false,
    reply: vi.fn(async () => undefined),
    followUp: vi.fn(async () => undefined),
    editReply: vi.fn(async () => undefined),
    deferReply: vi.fn(async () => undefined),
    options: {
      getSubcommandGroup: () => null,
      getSubcommand: () => args?.subcommand ?? "join",
      getString: () => null,
      getBoolean: () => null,
    },
  } as any;
}

afterEach(() => {
  joinVoiceMock.mockReset();
  leaveVoiceMock.mockReset();
  startReceiverMock.mockReset();
  stopReceiverMock.mockReset();
  overlayEmitPresenceMock.mockReset();
  currentVoiceState = null;
  activeMeepoState.current = {
    guild_id: "guild-1",
    channel_id: "text-1",
    created_at_ms: Date.now(),
  } as any;
  vi.unstubAllEnvs();
  vi.resetModules();

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore transient Windows file-lock cleanup issues.
      }
    }
  }
});

describe("legacy lab session persistence", () => {
  test("legacy join creates a persisted lab session when none is active", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-legacy-session-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    joinVoiceMock.mockResolvedValue({ id: "connection-1" });
    startReceiverMock.mockReturnValue({
      ok: true,
      reason: "started",
      channelId: "voice-1",
    });

    const { meepo } = await import("../commands/meepoLegacy.js");
    const { getDbForCampaign } = await import("../db.js");
    const { getActiveSession } = await import("../sessions/sessions.js");

    const db = getDbForCampaign("default");
    const interaction = buildInteraction();
    const execCtx = {
      guildId: "guild-1",
      campaignSlug: "default",
      dbPath: "test.sqlite",
      db,
      trace_id: "trace-legacy-join",
      interaction_id: "interaction-legacy-join",
    } as any;

    await meepo.execute(interaction, execCtx);

    const session = getActiveSession("guild-1");
    expect(joinVoiceMock).toHaveBeenCalledTimes(1);
    expect(startReceiverMock).toHaveBeenCalledWith("guild-1");
    expect(session).toBeTruthy();
    expect(session?.mode_at_start).toBe("lab");
    expect(session?.source).toBe("live");
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "*poof!* Meepo is here! Listening in <#voice-1>! Meep meep! 🎧",
    });

    db.close();
  });

  test("legacy sleep closes an active lab session even after voice detaches", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-legacy-sleep-end-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { meepo } = await import("../commands/meepoLegacy.js");
    const { getDbForCampaign } = await import("../db.js");
    const { getActiveSession, getMostRecentSession, startSession } = await import("../sessions/sessions.js");

    const db = getDbForCampaign("default");
    startSession("guild-1", "dm-user", "DM", { source: "live", modeAtStart: "lab" });

    const execCtx = {
      guildId: "guild-1",
      campaignSlug: "default",
      dbPath: "test.sqlite",
      db,
      trace_id: "trace-legacy-sleep-end",
      interaction_id: "interaction-legacy-sleep-end",
    } as any;

    const interaction = buildInteraction({ subcommand: "sleep" });
    await meepo.execute(interaction, execCtx);

    expect(getActiveSession("guild-1")).toBeNull();
    expect(getMostRecentSession("guild-1")?.status).toBe("completed");
    expect(leaveVoiceMock).not.toHaveBeenCalled();
    const content = String(interaction.reply.mock.calls[0]?.[0]?.content ?? "");
    expect(content).toContain("closes the active lab session");

    db.close();
  });

  test("legacy leave closes an active lab session even when voice is already gone", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-legacy-leave-end-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { meepo } = await import("../commands/meepoLegacy.js");
    const { getDbForCampaign } = await import("../db.js");
    const { getActiveSession, getMostRecentSession, startSession } = await import("../sessions/sessions.js");

    const db = getDbForCampaign("default");
    startSession("guild-1", "dm-user", "DM", { source: "live", modeAtStart: "lab" });

    const execCtx = {
      guildId: "guild-1",
      campaignSlug: "default",
      dbPath: "test.sqlite",
      db,
      trace_id: "trace-legacy-leave-end",
      interaction_id: "interaction-legacy-leave-end",
    } as any;

    const interaction = buildInteraction({ subcommand: "leave" });
    await meepo.execute(interaction, execCtx);

    expect(getActiveSession("guild-1")).toBeNull();
    expect(getMostRecentSession("guild-1")?.status).toBe("completed");
    expect(leaveVoiceMock).not.toHaveBeenCalled();
    const content = String(interaction.reply.mock.calls[0]?.[0]?.content ?? "");
    expect(content).toContain("lab session has been closed");

    db.close();
  });

  test("legacy leave is blocked while a showtime session is active", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-legacy-leave-showtime-guard-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { meepo } = await import("../commands/meepoLegacy.js");
    const { getDbForCampaign } = await import("../db.js");
    const { getActiveSession, startSession } = await import("../sessions/sessions.js");

    const db = getDbForCampaign("default");
    startSession("guild-1", "dm-user", "DM", { source: "live", kind: "canon", modeAtStart: "canon" });
    currentVoiceState = { channelId: "voice-1" };

    const execCtx = {
      guildId: "guild-1",
      campaignSlug: "default",
      dbPath: "test.sqlite",
      db,
      trace_id: "trace-legacy-leave-showtime-guard",
      interaction_id: "interaction-legacy-leave-showtime-guard",
    } as any;

    const interaction = buildInteraction({ subcommand: "leave" });
    await meepo.execute(interaction, execCtx);

    expect(getActiveSession("guild-1")).toBeTruthy();
    expect(stopReceiverMock).not.toHaveBeenCalled();
    expect(leaveVoiceMock).not.toHaveBeenCalled();
    const content = String(interaction.reply.mock.calls[0]?.[0]?.content ?? "");
    expect(content).toContain("/meepo showtime end");

    db.close();
  });

  test("legacy sleep is blocked while a showtime session is active", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-legacy-sleep-showtime-guard-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { meepo } = await import("../commands/meepoLegacy.js");
    const { getDbForCampaign } = await import("../db.js");
    const { getActiveSession, startSession } = await import("../sessions/sessions.js");

    const db = getDbForCampaign("default");
    startSession("guild-1", "dm-user", "DM", { source: "live", kind: "canon", modeAtStart: "canon" });

    const execCtx = {
      guildId: "guild-1",
      campaignSlug: "default",
      dbPath: "test.sqlite",
      db,
      trace_id: "trace-legacy-sleep-showtime-guard",
      interaction_id: "interaction-legacy-sleep-showtime-guard",
    } as any;

    const interaction = buildInteraction({ subcommand: "sleep" });
    await meepo.execute(interaction, execCtx);

    expect(getActiveSession("guild-1")).toBeTruthy();
    expect(stopReceiverMock).not.toHaveBeenCalled();
    expect(leaveVoiceMock).not.toHaveBeenCalled();
    const content = String(interaction.reply.mock.calls[0]?.[0]?.content ?? "");
    expect(content).toContain("/meepo showtime end");

    db.close();
  });
});