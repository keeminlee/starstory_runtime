import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let controlDb: Database.Database;
let campaignDb: Database.Database;

const getActiveMeepoMock = vi.fn();
const sleepMeepoMock = vi.fn(() => 1);
const getActiveSessionMock = vi.fn();
const endSessionMock = vi.fn(() => 1);
const getVoiceStateMock = vi.fn<() => { channelId: string } | null>(() => null);
const leaveVoiceMock = vi.fn();

vi.mock("../config/env.js", () => ({
  cfg: {
    session: { autoSleepMs: 600_000 },
    logging: {
      level: "error",
      scopes: [],
      format: "pretty",
      debugLatch: false,
    },
    voice: {
      debug: false,
    },
  },
}));

vi.mock("../campaign/guildConfig.js", () => ({
  resolveCampaignSlug: vi.fn(() => "default"),
}));

vi.mock("../db.js", () => ({
  getDbForCampaign: vi.fn(() => campaignDb as any),
  getControlDb: vi.fn(() => controlDb as any),
}));

vi.mock("../meepo/state.js", () => ({
  getActiveMeepo: getActiveMeepoMock,
  sleepMeepo: sleepMeepoMock,
}));

vi.mock("../sessions/sessions.js", () => ({
  getActiveSession: getActiveSessionMock,
  endSession: endSessionMock,
}));

vi.mock("../voice/state.js", () => ({
  getVoiceState: getVoiceStateMock,
}));

vi.mock("../voice/connection.js", () => ({
  leaveVoice: leaveVoiceMock,
}));

function insertActiveNpc(guildId: string): void {
  controlDb.prepare("INSERT INTO npc_instances (guild_id, is_active) VALUES (?, 1)").run(guildId);
}

describe("meepo auto-sleep", () => {
  beforeEach(() => {
    controlDb = new Database(":memory:");
    controlDb.exec(`
      CREATE TABLE npc_instances (
        guild_id TEXT NOT NULL,
        is_active INTEGER NOT NULL
      );
    `);

    campaignDb = new Database(":memory:");
    campaignDb.exec(`
      CREATE TABLE ledger_entries (
        guild_id TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL
      );
    `);

    insertActiveNpc("guild-1");

    getActiveMeepoMock.mockReset();
    sleepMeepoMock.mockReset();
    sleepMeepoMock.mockReturnValue(1);
    getActiveSessionMock.mockReset();
    endSessionMock.mockReset();
    endSessionMock.mockReturnValue(1);
    getVoiceStateMock.mockReset();
    getVoiceStateMock.mockReturnValue(null);
    leaveVoiceMock.mockReset();
  });

  afterEach(() => {
    controlDb.close();
    campaignDb.close();
    vi.resetModules();
  });

  test("fresh showtime session does not auto-end when there is no ledger activity yet", async () => {
    const nowMs = 1_000_000;
    getActiveMeepoMock.mockReturnValue({ guild_id: "guild-1", created_at_ms: nowMs - 5_000 });
    getActiveSessionMock.mockReturnValue({
      session_id: "session-1",
      started_at_ms: nowMs - 5_000,
      created_at_ms: nowMs - 5_000,
    });

    const { evaluateAutoSleepForGuild, runAutoSleepCheck } = await import("../meepo/autoSleep.js");

    const evaluation = evaluateAutoSleepForGuild("guild-1", nowMs);
    expect(evaluation.baselineSource).toBe("session_started_at");
    expect(evaluation.shouldSleep).toBe(false);
    expect(evaluation.inactivityMs).toBe(5_000);

    runAutoSleepCheck(nowMs);

    expect(endSessionMock).not.toHaveBeenCalled();
    expect(leaveVoiceMock).not.toHaveBeenCalled();
    expect(sleepMeepoMock).not.toHaveBeenCalled();
  });

  test("auto-sleep uses session start fallback when the latest ledger activity is stale", async () => {
    const nowMs = 2_000_000;
    campaignDb.prepare("INSERT INTO ledger_entries (guild_id, timestamp_ms) VALUES (?, ?)").run("guild-1", nowMs - 3_600_000);

    getActiveMeepoMock.mockReturnValue({ guild_id: "guild-1", created_at_ms: nowMs - 5_000 });
    getActiveSessionMock.mockReturnValue({
      session_id: "session-2",
      started_at_ms: nowMs - 5_000,
      created_at_ms: nowMs - 5_000,
    });

    const { evaluateAutoSleepForGuild } = await import("../meepo/autoSleep.js");

    const evaluation = evaluateAutoSleepForGuild("guild-1", nowMs);
    expect(evaluation.lastLedgerTimestampMs).toBe(nowMs - 3_600_000);
    expect(evaluation.baselineSource).toBe("session_started_at");
    expect(evaluation.lastActivityTimestampMs).toBe(nowMs - 5_000);
    expect(evaluation.shouldSleep).toBe(false);
  });

  test("auto-sleep ends only when inactivity truly exceeds threshold", async () => {
    const nowMs = 3_000_000;
    getActiveMeepoMock.mockReturnValue({ guild_id: "guild-1", created_at_ms: nowMs - 700_000 });
    getActiveSessionMock.mockReturnValue({
      session_id: "session-3",
      started_at_ms: nowMs - 700_000,
      created_at_ms: nowMs - 700_000,
    });
    getVoiceStateMock.mockReturnValue({ channelId: "voice-1" });

    const { evaluateAutoSleepForGuild, runAutoSleepCheck } = await import("../meepo/autoSleep.js");

    const evaluation = evaluateAutoSleepForGuild("guild-1", nowMs);
    expect(evaluation.shouldSleep).toBe(true);
    expect(evaluation.decisionReason).toBe("threshold_exceeded");

    runAutoSleepCheck(nowMs);

    expect(endSessionMock).toHaveBeenCalledWith("guild-1", "auto_sleep");
    expect(leaveVoiceMock).toHaveBeenCalledWith("guild-1");
    expect(sleepMeepoMock).toHaveBeenCalledWith("guild-1");
  });
});