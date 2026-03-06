import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import type { PromptSpec } from "../../scripts/awakening/_schema.js";

export const AWAKEN_CHANNEL_SELECT_CUSTOM_ID_PREFIX = "awaken:channel_select";

export type ParsedChannelSelectCustomId = {
  sceneId: string;
  key: string;
  nonce: string;
};

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildChannelSelectCustomId(args: {
  sceneId: string;
  key: string;
  nonce: string;
}): string {
  return [
    AWAKEN_CHANNEL_SELECT_CUSTOM_ID_PREFIX,
    encodeURIComponent(args.sceneId),
    encodeURIComponent(args.key),
    encodeURIComponent(args.nonce),
  ].join(":");
}

export function parseChannelSelectCustomId(customId: string): ParsedChannelSelectCustomId | null {
  if (!customId.startsWith(`${AWAKEN_CHANNEL_SELECT_CUSTOM_ID_PREFIX}:`)) return null;
  const parts = customId.split(":");
  if (parts.length !== 5) return null;
  try {
    return {
      sceneId: decodeURIComponent(parts[2] ?? ""),
      key: decodeURIComponent(parts[3] ?? ""),
      nonce: decodeURIComponent(parts[4] ?? ""),
    };
  } catch {
    return null;
  }
}

function resolveChannelFilter(prompt: PromptSpec): "text" | "voice" {
  const raw = (prompt as Record<string, unknown>).filter;
  return raw === "voice" ? "voice" : "text";
}

export function buildChannelSelectPromptPayload(args: {
  prompt: PromptSpec;
  sceneId: string;
  key: string;
  nonce: string;
  channels: Array<{ id: string; name: string }>;
  currentChannelName?: string;
  pendingValue?: string | null;
}): { content: string; components: ActionRowBuilder<StringSelectMenuBuilder>[]; ephemeral: true } {
  const label = toNonEmptyString((args.prompt as Record<string, unknown>).label) ?? "Select one channel";
  const defaultMode = (args.prompt as Record<string, unknown>).default === "current_channel";
  const filter = resolveChannelFilter(args.prompt);

  const options = args.channels
    .slice(0, 25)
    .map((channel) => ({
      label: channel.name.slice(0, 100),
      value: channel.id,
      default: pendingValueOrEmpty(args.pendingValue) === channel.id,
    }));

  const hint = defaultMode && !pendingValueOrEmpty(args.pendingValue) && args.currentChannelName
    ? `\nDefault: #${args.currentChannelName}`
    : "";

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(buildChannelSelectCustomId({ sceneId: args.sceneId, key: args.key, nonce: args.nonce }))
      .setPlaceholder(`Select ${filter} channel`)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );

  return {
    content: `Awakening input needed: ${label}${hint}`,
    components: options.length > 0 ? [row] : [],
    ephemeral: true,
  };
}

function pendingValueOrEmpty(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getChannelSelectFilter(prompt: PromptSpec): "text" | "voice" {
  return resolveChannelFilter(prompt);
}
