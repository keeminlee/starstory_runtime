import Database from "better-sqlite3";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../campaign/guildConfig.js", () => ({
  resolveCampaignSlug: vi.fn(() => "default"),
}));

vi.mock("../db.js", () => ({
  getDbForCampaign: vi.fn(),
}));

vi.mock("../config/env.js", () => ({
  cfg: {
    data: {
      root: ".",
      campaignsDir: "campaigns",
    },
    db: {
      filename: "bot.sqlite",
      path: "bot.sqlite",
    },
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

vi.mock("../ledger/meepoContextRepo.js", () => ({
  REFRESH_STT_PROMPT_ACTION: "refresh-stt-prompt",
  enqueueActionIfMissing: vi.fn(() => ({ queued: true })),
}));

vi.mock("../runtime/runtimeContextBanner.js", () => ({
  logRuntimeContextBanner: vi.fn(),
}));

vi.mock("../sessions/sessionRuntime.js", () => ({
  resolveEffectiveMode: vi.fn(() => "canon"),
  sessionKindForMode: vi.fn(() => "canon"),
  markRuntimeSessionStarted: vi.fn(),
  markRuntimeSessionEnded: vi.fn(),
}));

function createDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE sessions (
      session_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      mode_at_start TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','interrupted')),
      label TEXT,
      created_at_ms INTEGER NOT NULL,
      started_at_ms INTEGER NOT NULL,
      ended_at_ms INTEGER,
      ended_reason TEXT,
      started_by_id TEXT,
      started_by_name TEXT,
      source TEXT
    );

    CREATE UNIQUE INDEX idx_one_active_session_per_guild
      ON sessions(guild_id)
      WHERE status = 'active';
  `);
  return db;
}

describe("session status invariants", () => {
  let db: Database.Database;

  afterEach(() => {
    vi.clearAllMocks();
    db?.close();
  });

  test("enforces one active session per guild and allows restart after completion", async () => {
    db = createDb();

    const { getDbForCampaign } = await import("../db.js");
    vi.mocked(getDbForCampaign).mockReturnValue(db as any);

    const { endSession, getActiveSession, startSession } = await import("../sessions/sessions.js");

    const guildId = "guild-1";
    const first = startSession(guildId, "u1", "Alice", {
      modeAtStart: "canon",
      kind: "canon",
      label: "C2E20",
    });
    expect(first.status).toBe("active");
    expect(getActiveSession(guildId)?.session_id).toBe(first.session_id);

    expect(() =>
      startSession(guildId, "u2", "Bob", {
        modeAtStart: "canon",
        kind: "canon",
      })
    ).toThrow(/UNIQUE|constraint/i);

    const ended = endSession(guildId, "manual");
    expect(ended).toBe(1);
    expect(getActiveSession(guildId)).toBeNull();

    const completedStatus = db
      .prepare("SELECT status FROM sessions WHERE session_id = ?")
      .get(first.session_id) as { status: string };
    expect(completedStatus.status).toBe("completed");

    const second = startSession(guildId, "u3", "Carol", {
      modeAtStart: "canon",
      kind: "canon",
    });
    expect(getActiveSession(guildId)?.session_id).toBe(second.session_id);
  });
});
