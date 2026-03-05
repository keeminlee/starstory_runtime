import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import type { PromptSpec } from "../../scripts/awakening/_schema.js";

export const AWAKEN_ROLE_SELECT_CUSTOM_ID_PREFIX = "awaken:role_select";

export type ParsedRoleSelectPromptCustomId = {
  sceneId: string;
  key: string;
  nonce: string;
};

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildRoleSelectPromptCustomId(args: {
  sceneId: string;
  key: string;
  nonce: string;
}): string {
  return [
    AWAKEN_ROLE_SELECT_CUSTOM_ID_PREFIX,
    encodeURIComponent(args.sceneId),
    encodeURIComponent(args.key),
    encodeURIComponent(args.nonce),
  ].join(":");
}

export function parseRoleSelectPromptCustomId(customId: string): ParsedRoleSelectPromptCustomId | null {
  if (!customId.startsWith(`${AWAKEN_ROLE_SELECT_CUSTOM_ID_PREFIX}:`)) return null;
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

export function buildRoleSelectPromptPayload(args: {
  prompt: PromptSpec;
  sceneId: string;
  key: string;
  nonce: string;
  roles: Array<{ id: string; name: string }>;
}): { content: string; components: ActionRowBuilder<StringSelectMenuBuilder>[]; ephemeral: true } {
  const label = toNonEmptyString((args.prompt as Record<string, unknown>).label) ?? "Select one role";
  const options = args.roles
    .slice(0, 25)
    .map((role) => ({
      label: role.name.slice(0, 100),
      value: role.id,
    }));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        buildRoleSelectPromptCustomId({
          sceneId: args.sceneId,
          key: args.key,
          nonce: args.nonce,
        })
      )
      .setPlaceholder(label)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );

  return {
    content: `Awakening input needed: ${label}`,
    components: options.length > 0 ? [row] : [],
    ephemeral: true,
  };
}
