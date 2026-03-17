import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, test, vi } from "vitest";

process.env.DISCORD_TOKEN ??= "test-token";
process.env.OPENAI_API_KEY ??= "test-openai-key";

const tempDirs: string[] = [];
const stopReceiverMock = vi.fn();
const cleanupSpeakerMock = vi.fn();
const overlayEmitPresenceMock = vi.fn();
const joinVoiceChannelMock = vi.fn();
const entersStateMock = vi.fn();

const voiceStatuses = {
  Ready: "ready",
  Destroyed: "destroyed",
  Disconnected: "disconnected",
};

vi.mock("@discordjs/voice", () => ({
  joinVoiceChannel: joinVoiceChannelMock,
  entersState: entersStateMock,
  VoiceConnectionStatus: voiceStatuses,
}));

vi.mock("../voice/receiver.js", () => ({
  stopReceiver: stopReceiverMock,
}));

vi.mock("../voice/speaker.js", () => ({
  cleanupSpeaker: cleanupSpeakerMock,
}));

vi.mock("../overlay/server.js", () => ({
  overlayEmitPresence: overlayEmitPresenceMock,
}));

vi.mock("../config/rawEnv.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/rawEnv.js")>();
  return {
    ...actual,
    getEnvBool: vi.fn(() => false),
  };
});

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("MIGRATIONS_SILENT", "1");
  vi.stubEnv("DEFAULT_CAMPAIGN_SLUG", "default");
}

class FakeConnection extends EventEmitter {
  destroy = vi.fn();
  receiver = {
    speaking: {
      off: vi.fn(),
      on: vi.fn(),
    },
  };
}

afterEach(() => {
  stopReceiverMock.mockReset();
  cleanupSpeakerMock.mockReset();
  overlayEmitPresenceMock.mockReset();
  joinVoiceChannelMock.mockReset();
  entersStateMock.mockReset();
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

describe("showtime lifecycle authority", () => {
  test("voice leave cleanup does not end an active session", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-lifecycle-authority-leave-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { getDbForCampaign } = await import("../db.js");
    const { startSession, getActiveSession } = await import("../sessions/sessions.js");
    const { setVoiceState, getVoiceState } = await import("../voice/state.js");
    const { leaveVoice } = await import("../voice/connection.js");

    const db = getDbForCampaign("default");
    const session = startSession("guild-1", "dm-user", "DM");
    const connection = new FakeConnection();

    setVoiceState("guild-1", {
      channelId: "voice-1",
      connection: connection as any,
      guild: {} as any,
      sttEnabled: true,
      hushEnabled: true,
      connectedAt: Date.now(),
    });

    leaveVoice("guild-1");

    expect(stopReceiverMock).toHaveBeenCalledWith("guild-1");
    expect(cleanupSpeakerMock).toHaveBeenCalledWith("guild-1");
    expect(connection.destroy).toHaveBeenCalledTimes(1);
    expect(getVoiceState("guild-1")).toBeNull();
    expect(getActiveSession("guild-1")?.session_id).toBe(session.session_id);

    db.close();
  });

  test("voice runtime detach cleanup does not end an active session", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-lifecycle-authority-detach-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const connection = new FakeConnection();
    joinVoiceChannelMock.mockReturnValue(connection);
    entersStateMock.mockResolvedValue(undefined);

    const { getDbForCampaign } = await import("../db.js");
    const { startSession, getActiveSession } = await import("../sessions/sessions.js");
    const { setVoiceState, getVoiceState } = await import("../voice/state.js");
    const { joinVoice } = await import("../voice/connection.js");

    const db = getDbForCampaign("default");
    const session = startSession("guild-1", "dm-user", "DM");
    const joined = await joinVoice({
      guildId: "guild-1",
      channelId: "voice-1",
      adapterCreator: {},
    });

    setVoiceState("guild-1", {
      channelId: "voice-1",
      connection: joined as any,
      guild: {} as any,
      sttEnabled: true,
      hushEnabled: true,
      connectedAt: Date.now(),
    });

    connection.emit("stateChange", { status: voiceStatuses.Ready }, { status: voiceStatuses.Destroyed });

    expect(stopReceiverMock).toHaveBeenCalledWith("guild-1");
    expect(cleanupSpeakerMock).toHaveBeenCalledWith("guild-1");
    expect(getVoiceState("guild-1")).toBeNull();
    expect(getActiveSession("guild-1")?.session_id).toBe(session.session_id);

    db.close();
  });
});