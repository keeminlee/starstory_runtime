import { log } from "../utils/logger.js";
import { getActiveSession } from "./sessions.js";
import { getActiveSessionId, markRuntimeSessionEnded, markRuntimeSessionStarted } from "./sessionRuntime.js";

const reconcileLog = log.withScope("session-reconcile");

export type BootSessionReconcileResult = {
  guildId: string;
  dbActiveSessionId: string | null;
  runtimeActiveSessionId: string | null;
  changed: boolean;
  action: "none" | "set_runtime_active" | "clear_runtime_active";
};

export function reconcileSessionStateOnBoot(guildId: string): BootSessionReconcileResult {
  const dbActiveSessionId = getActiveSession(guildId)?.session_id ?? null;
  const runtimeActiveSessionId = getActiveSessionId(guildId);

  if (dbActiveSessionId && runtimeActiveSessionId !== dbActiveSessionId) {
    markRuntimeSessionStarted(guildId, dbActiveSessionId);
    reconcileLog.info("Boot reconciliation set runtime active session from DB truth", {
      guild_id: guildId,
      db_active_session_id: dbActiveSessionId,
      runtime_active_session_id: runtimeActiveSessionId,
      action: "set_runtime_active",
    });
    return {
      guildId,
      dbActiveSessionId,
      runtimeActiveSessionId,
      changed: true,
      action: "set_runtime_active",
    };
  }

  if (!dbActiveSessionId && runtimeActiveSessionId) {
    markRuntimeSessionEnded(guildId);
    reconcileLog.info("Boot reconciliation cleared stale runtime active session", {
      guild_id: guildId,
      runtime_active_session_id: runtimeActiveSessionId,
      action: "clear_runtime_active",
    });
    return {
      guildId,
      dbActiveSessionId,
      runtimeActiveSessionId,
      changed: true,
      action: "clear_runtime_active",
    };
  }

  reconcileLog.debug("Boot reconciliation no-op", {
    guild_id: guildId,
    db_active_session_id: dbActiveSessionId,
    runtime_active_session_id: runtimeActiveSessionId,
    action: "none",
  });

  return {
    guildId,
    dbActiveSessionId,
    runtimeActiveSessionId,
    changed: false,
    action: "none",
  };
}

export function reconcileSessionStateOnBootForGuilds(guildIds: string[]): {
  totalGuilds: number;
  changedGuilds: number;
  setRuntimeActiveCount: number;
  clearedRuntimeActiveCount: number;
  results: BootSessionReconcileResult[];
} {
  const results = guildIds.map((guildId) => reconcileSessionStateOnBoot(guildId));

  const changedGuilds = results.filter((r) => r.changed).length;
  const setRuntimeActiveCount = results.filter((r) => r.action === "set_runtime_active").length;
  const clearedRuntimeActiveCount = results.filter((r) => r.action === "clear_runtime_active").length;

  return {
    totalGuilds: guildIds.length,
    changedGuilds,
    setRuntimeActiveCount,
    clearedRuntimeActiveCount,
    results,
  };
}
