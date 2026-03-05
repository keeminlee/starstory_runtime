import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import type { PromptSpec } from "../../scripts/awakening/_schema.js";

export const AWAKEN_REGISTRY_ADD_CUSTOM_ID_PREFIX = "awaken:rb:add";
export const AWAKEN_REGISTRY_DONE_CUSTOM_ID_PREFIX = "awaken:rb:done";
export const AWAKEN_REGISTRY_USER_SELECT_CUSTOM_ID_PREFIX = "awaken:rb:user";
export const AWAKEN_REGISTRY_NAME_MODAL_ID_PREFIX = "awaken:rb:name";
export const AWAKEN_REGISTRY_NAME_INPUT_ID = "awaken_rb_character_name";

export type ParsedRegistryPromptCustomId = {
  sceneId: string;
  key: string;
  nonce: string;
};

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildId(prefix: string, args: { sceneId: string; key: string; nonce: string }): string {
  return [
    prefix,
    encodeURIComponent(args.sceneId),
    encodeURIComponent(args.key),
    encodeURIComponent(args.nonce),
  ].join(":");
}

function parseId(prefix: string, customId: string): ParsedRegistryPromptCustomId | null {
  if (!customId.startsWith(`${prefix}:`)) return null;
  const parts = customId.split(":");
  if (parts.length !== 6) return null;
  try {
    return {
      sceneId: decodeURIComponent(parts[3] ?? ""),
      key: decodeURIComponent(parts[4] ?? ""),
      nonce: decodeURIComponent(parts[5] ?? ""),
    };
  } catch {
    return null;
  }
}

export function buildRegistryAddCustomId(args: { sceneId: string; key: string; nonce: string }): string {
  return buildId(AWAKEN_REGISTRY_ADD_CUSTOM_ID_PREFIX, args);
}

export function buildRegistryDoneCustomId(args: { sceneId: string; key: string; nonce: string }): string {
  return buildId(AWAKEN_REGISTRY_DONE_CUSTOM_ID_PREFIX, args);
}

export function buildRegistryUserSelectCustomId(args: { sceneId: string; key: string; nonce: string }): string {
  return buildId(AWAKEN_REGISTRY_USER_SELECT_CUSTOM_ID_PREFIX, args);
}

export function buildRegistryNameModalCustomId(args: { sceneId: string; key: string; nonce: string }): string {
  return buildId(AWAKEN_REGISTRY_NAME_MODAL_ID_PREFIX, args);
}

export function parseRegistryAddCustomId(customId: string): ParsedRegistryPromptCustomId | null {
  return parseId(AWAKEN_REGISTRY_ADD_CUSTOM_ID_PREFIX, customId);
}

export function parseRegistryDoneCustomId(customId: string): ParsedRegistryPromptCustomId | null {
  return parseId(AWAKEN_REGISTRY_DONE_CUSTOM_ID_PREFIX, customId);
}

export function parseRegistryUserSelectCustomId(customId: string): ParsedRegistryPromptCustomId | null {
  return parseId(AWAKEN_REGISTRY_USER_SELECT_CUSTOM_ID_PREFIX, customId);
}

export function parseRegistryNameModalCustomId(customId: string): ParsedRegistryPromptCustomId | null {
  return parseId(AWAKEN_REGISTRY_NAME_MODAL_ID_PREFIX, customId);
}

export function buildRegistryBuilderPromptPayload(args: {
  prompt: PromptSpec;
  sceneId: string;
  key: string;
  nonce: string;
  playersCount: number;
}): { content: string; components: ActionRowBuilder<ButtonBuilder>[]; ephemeral: true } {
  const label = toNonEmptyString((args.prompt as Record<string, unknown>).label) ?? "Build player registry";

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildRegistryAddCustomId({ sceneId: args.sceneId, key: args.key, nonce: args.nonce }))
      .setLabel("Add player")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildRegistryDoneCustomId({ sceneId: args.sceneId, key: args.key, nonce: args.nonce }))
      .setLabel("Done")
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    content: `Awakening input needed: ${label}\nPlayers added: ${args.playersCount}`,
    components: [row],
    ephemeral: true,
  };
}

export function buildRegistryUserSelectPayload(args: {
  sceneId: string;
  key: string;
  nonce: string;
  characterName: string;
  members: Array<{ id: string; label: string }>;
}): { content: string; components: ActionRowBuilder<StringSelectMenuBuilder>[]; ephemeral: true } {
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(buildRegistryUserSelectCustomId({ sceneId: args.sceneId, key: args.key, nonce: args.nonce }))
      .setPlaceholder("Select player")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        args.members.slice(0, 25).map((member) => ({ label: member.label.slice(0, 100), value: member.id }))
      )
  );

  return {
    content: `Assign character \"${args.characterName}\" to a player.`,
    components: args.members.length > 0 ? [row] : [],
    ephemeral: true,
  };
}
