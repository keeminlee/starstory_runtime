import { beforeEach, describe, expect, test, vi } from "vitest";

const getActiveSessionMock = vi.fn();
const getActiveSessionIdMock = vi.fn();
const markRuntimeSessionStartedMock = vi.fn();
const markRuntimeSessionEndedMock = vi.fn();

vi.mock("../sessions/sessions.js", () => ({
  getActiveSession: getActiveSessionMock,
}));

vi.mock("../sessions/sessionRuntime.js", () => ({
  getActiveSessionId: getActiveSessionIdMock,
  markRuntimeSessionStarted: markRuntimeSessionStartedMock,
  markRuntimeSessionEnded: markRuntimeSessionEndedMock,
}));

vi.mock("../utils/logger.js", () => ({
  log: {
    withScope: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

describe("session boot reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("sets runtime active session when DB has active session and runtime differs", async () => {
    getActiveSessionMock.mockReturnValue({ session_id: "s-db-1" });
    getActiveSessionIdMock.mockReturnValue(null);

    const { reconcileSessionStateOnBoot } = await import("../sessions/reconcileSessionsOnBoot.js");
    const result = reconcileSessionStateOnBoot("guild-1");

    expect(markRuntimeSessionStartedMock).toHaveBeenCalledWith("guild-1", "s-db-1");
    expect(markRuntimeSessionEndedMock).not.toHaveBeenCalled();
    expect(result.action).toBe("set_runtime_active");
    expect(result.changed).toBe(true);
  });

  test("clears runtime active session when DB has no active session", async () => {
    getActiveSessionMock.mockReturnValue(null);
    getActiveSessionIdMock.mockReturnValue("stale-runtime-session");

    const { reconcileSessionStateOnBoot } = await import("../sessions/reconcileSessionsOnBoot.js");
    const result = reconcileSessionStateOnBoot("guild-2");

    expect(markRuntimeSessionEndedMock).toHaveBeenCalledWith("guild-2");
    expect(markRuntimeSessionStartedMock).not.toHaveBeenCalled();
    expect(result.action).toBe("clear_runtime_active");
    expect(result.changed).toBe(true);
  });

  test("is no-op when runtime and DB are already aligned", async () => {
    getActiveSessionMock.mockReturnValue({ session_id: "s-db-3" });
    getActiveSessionIdMock.mockReturnValue("s-db-3");

    const { reconcileSessionStateOnBoot } = await import("../sessions/reconcileSessionsOnBoot.js");
    const result = reconcileSessionStateOnBoot("guild-3");

    expect(markRuntimeSessionEndedMock).not.toHaveBeenCalled();
    expect(markRuntimeSessionStartedMock).not.toHaveBeenCalled();
    expect(result.action).toBe("none");
    expect(result.changed).toBe(false);
  });

  test("aggregates multi-guild reconciliation counts", async () => {
    const dbSessions = new Map<string, { session_id: string } | null>([
      ["guild-a", { session_id: "s-a" }],
      ["guild-b", null],
      ["guild-c", { session_id: "s-c" }],
    ]);

    const runtimeSessions = new Map<string, string | null>([
      ["guild-a", null],
      ["guild-b", "stale-b"],
      ["guild-c", "s-c"],
    ]);

    getActiveSessionMock.mockImplementation((guildId: string) => dbSessions.get(guildId) ?? null);
    getActiveSessionIdMock.mockImplementation((guildId: string) => runtimeSessions.get(guildId) ?? null);

    const { reconcileSessionStateOnBootForGuilds } = await import("../sessions/reconcileSessionsOnBoot.js");
    const summary = reconcileSessionStateOnBootForGuilds(["guild-a", "guild-b", "guild-c"]);

    expect(summary.totalGuilds).toBe(3);
    expect(summary.changedGuilds).toBe(2);
    expect(summary.setRuntimeActiveCount).toBe(1);
    expect(summary.clearedRuntimeActiveCount).toBe(1);
  });
});
