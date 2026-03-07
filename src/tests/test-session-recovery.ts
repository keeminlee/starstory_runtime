import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../campaign/guildConfig.js", () => ({
  resolveCampaignSlug: vi.fn(() => "default"),
}));

vi.mock("../db.js", () => ({
  getDbForCampaign: vi.fn(),
}));

vi.mock("../config/env.js", () => ({
  cfg: {
    data: { root: ".", campaignsDir: "campaigns" },
    db: { filename: "bot.sqlite", path: "bot.sqlite" },
    logging: { level: "error", scopes: [], format: "pretty", debugLatch: false },
    voice: { debug: false },
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
  getActiveSessionId: vi.fn(() => null),
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

function insertSession(
  db: Database.Database,
  args: {
    sessionId: string;
    guildId: string;
    status: "active" | "completed" | "interrupted";
    endedAtMs?: number | null;
    endedReason?: string | null;
    startedAtMs?: number;
    createdAtMs?: number;
  }
): void {
  const now = Date.now();
  db.prepare(
    `
    INSERT INTO sessions (
      session_id,
      guild_id,
      kind,
      mode_at_start,
      status,
      label,
      created_at_ms,
      started_at_ms,
      ended_at_ms,
      ended_reason,
      started_by_id,
      started_by_name,
      source
    ) VALUES (?, ?, 'canon', 'canon', ?, NULL, ?, ?, ?, ?, 'u1', 'User', 'live')
    `
  ).run(
    args.sessionId,
    args.guildId,
    args.status,
    args.createdAtMs ?? now,
    args.startedAtMs ?? now,
    args.endedAtMs ?? null,
    args.endedReason ?? null
  );
}

describe("session recovery", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb();
  });

  afterEach(() => {
    vi.clearAllMocks();
    db.close();
  });

  test("boot recovery marks active session interrupted", async () => {
    const { getDbForCampaign } = await import("../db.js");
    vi.mocked(getDbForCampaign).mockReturnValue(db as any);

    insertSession(db, {
      sessionId: "s-active-1",
      guildId: "guild-1",
      status: "active",
    });

    const { recoverInterruptedSessions } = await import("../sessions/sessionRecovery.js");
    const summary = recoverInterruptedSessions(["guild-1"]);

    expect(summary.interruptedSessions).toBe(1);
    const row = db
      .prepare("SELECT status, ended_at_ms, ended_reason FROM sessions WHERE session_id = ?")
      .get("s-active-1") as { status: string; ended_at_ms: number | null; ended_reason: string | null };

    expect(row.status).toBe("interrupted");
    expect(typeof row.ended_at_ms).toBe("number");
    expect(row.ended_reason).toBe("boot_recovery_interrupted");
  });

  test("completed session remains unchanged during recovery", async () => {
    const { getDbForCampaign } = await import("../db.js");
    vi.mocked(getDbForCampaign).mockReturnValue(db as any);

    insertSession(db, {
      sessionId: "s-completed-1",
      guildId: "guild-1",
      status: "completed",
      endedAtMs: 1234,
      endedReason: "manual",
    });

    const { recoverInterruptedSessions } = await import("../sessions/sessionRecovery.js");
    const summary = recoverInterruptedSessions(["guild-1"]);

    expect(summary.interruptedSessions).toBe(0);
    const row = db
      .prepare("SELECT status, ended_at_ms, ended_reason FROM sessions WHERE session_id = ?")
      .get("s-completed-1") as { status: string; ended_at_ms: number | null; ended_reason: string | null };

    expect(row.status).toBe("completed");
    expect(row.ended_at_ms).toBe(1234);
    expect(row.ended_reason).toBe("manual");
  });

  test("multi-guild recovery marks all active sessions interrupted", async () => {
    const { getDbForCampaign } = await import("../db.js");
    vi.mocked(getDbForCampaign).mockReturnValue(db as any);

    insertSession(db, {
      sessionId: "s-a",
      guildId: "guild-a",
      status: "active",
    });
    insertSession(db, {
      sessionId: "s-b",
      guildId: "guild-b",
      status: "active",
    });

    const { recoverInterruptedSessions } = await import("../sessions/sessionRecovery.js");
    const summary = recoverInterruptedSessions(["guild-a", "guild-b"]);

    expect(summary.interruptedSessions).toBe(2);
    const statuses = db
      .prepare("SELECT session_id, status FROM sessions ORDER BY session_id")
      .all() as Array<{ session_id: string; status: string }>;

    expect(statuses).toEqual([
      { session_id: "s-a", status: "interrupted" },
      { session_id: "s-b", status: "interrupted" },
    ]);
  });

  test("interrupted session allows a fresh showtime start", async () => {
    const { getDbForCampaign } = await import("../db.js");
    vi.mocked(getDbForCampaign).mockReturnValue(db as any);

    insertSession(db, {
      sessionId: "s-old",
      guildId: "guild-1",
      status: "interrupted",
      endedAtMs: 2000,
      endedReason: "boot_recovery_interrupted",
    });

    const { startSession, getActiveSession } = await import("../sessions/sessions.js");
    const created = startSession("guild-1", "u2", "DM", {
      modeAtStart: "canon",
      kind: "canon",
    });

    expect(created.status).toBe("active");
    const active = getActiveSession("guild-1");
    expect(active?.session_id).toBe(created.session_id);

    const interrupted = db
      .prepare("SELECT status FROM sessions WHERE session_id = ?")
      .get("s-old") as { status: string };
    expect(interrupted.status).toBe("interrupted");
  });
});
