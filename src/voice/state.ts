import { VoiceConnection } from "@discordjs/voice";
import type { Guild } from "discord.js";

/**
 * Voice state for a guild
 * In-memory only (Phase 1) - resets on bot restart
 */
export type VoiceState = {
  channelId: string;
  connection: VoiceConnection;
  guild: Guild;  // Discord guild reference for member lookups
  sttEnabled: boolean;
  hushEnabled: boolean;
  connectedAt: number;
};

/**
 * In-memory voice state store
 * Map<guildId, VoiceState>
 */
const voiceStates = new Map<string, VoiceState>();

/**
 * Get current voice state for a guild
 */
export function getVoiceState(guildId: string): VoiceState | null {
  return voiceStates.get(guildId) ?? null;
}

/**
 * Set voice state for a guild
 */
export function setVoiceState(guildId: string, state: VoiceState): void {
  voiceStates.set(guildId, state);
}

/**
 * Clear voice state for a guild
 */
export function clearVoiceState(guildId: string): void {
  voiceStates.delete(guildId);
}

/**
 * Get hush/listen-only mode for a guild voice state
 */
export function isVoiceHushEnabled(guildId: string): boolean {
  return voiceStates.get(guildId)?.hushEnabled ?? false;
}

/**
 * Set hush/listen-only mode for a guild voice state
 */
export function setVoiceHushEnabled(guildId: string, enabled: boolean): boolean {
  const state = voiceStates.get(guildId);
  if (!state) return false;
  state.hushEnabled = enabled;
  return true;
}

/**
 * Get all active guild IDs with voice state
 */
export function getActiveGuilds(): string[] {
  return Array.from(voiceStates.keys());
}
