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

function buildInteraction() {
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
      getSubcommand: () => "join",
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
});