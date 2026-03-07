import { getGuildAwakened } from "../campaign/guildConfig.js";
import { getActiveSession, type Session } from "./sessions.js";

export type LifecycleState = "Dormant" | "Awakened" | "Showtime";

export function guildAwakened(guildId: string): boolean {
  return getGuildAwakened(guildId);
}

export function getGuildActiveSession(guildId: string): Session | null {
  return getActiveSession(guildId);
}

// Lifecycle state is derived from persistent awakened flag + active session presence.
export function deriveLifecycleState(guildId: string): LifecycleState {
  if (!guildAwakened(guildId)) return "Dormant";
  if (getGuildActiveSession(guildId)) return "Showtime";
  return "Awakened";
}
