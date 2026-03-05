import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { PromptSpec } from "../../scripts/awakening/_schema.js";

export const AWAKEN_CHOICE_CUSTOM_ID_PREFIX = "awaken:choice";

export type ChoicePromptOption = {
  value: string;
  label: string;
};

export type ParsedChoicePromptCustomId = {
  sceneId: string;
  key: string;
  nonce: string;
  optionIndex: number;
};

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getChoicePromptOptions(prompt: PromptSpec): ChoicePromptOption[] {
  const rawOptions = (prompt as Record<string, unknown>).options;
  if (!Array.isArray(rawOptions)) return [];

  const parsed: ChoicePromptOption[] = [];
  for (const item of rawOptions) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const value = toNonEmptyString(row.value);
    const label = toNonEmptyString(row.label);
    if (!value || !label) continue;
    parsed.push({ value, label });
  }
  return parsed;
}

export function buildChoicePromptCustomId(args: {
  sceneId: string;
  key: string;
  nonce: string;
  optionIndex: number;
}): string {
  return [
    AWAKEN_CHOICE_CUSTOM_ID_PREFIX,
    encodeURIComponent(args.sceneId),
    encodeURIComponent(args.key),
    encodeURIComponent(args.nonce),
    String(args.optionIndex),
  ].join(":");
}

export function parseChoicePromptCustomId(customId: string): ParsedChoicePromptCustomId | null {
  if (!customId.startsWith(`${AWAKEN_CHOICE_CUSTOM_ID_PREFIX}:`)) return null;
  const parts = customId.split(":");
  if (parts.length !== 6) return null;
  const optionIndex = Number(parts[5]);
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return null;
  try {
    return {
      sceneId: decodeURIComponent(parts[2] ?? ""),
      key: decodeURIComponent(parts[3] ?? ""),
      nonce: decodeURIComponent(parts[4] ?? ""),
      optionIndex,
    };
  } catch {
    return null;
  }
}

export function resolveChoicePromptValue(prompt: PromptSpec, optionIndex: number): string | null {
  const options = getChoicePromptOptions(prompt);
  const selected = options[optionIndex];
  return selected ? selected.value : null;
}

export function buildChoicePromptPayload(args: {
  prompt: PromptSpec;
  sceneId: string;
  key: string;
  nonce: string;
}): { content: string; components: ActionRowBuilder<ButtonBuilder>[]; ephemeral: true } {
  const options = getChoicePromptOptions(args.prompt);
  const label = toNonEmptyString((args.prompt as Record<string, unknown>).label) ?? "Choose one option";

  const row = new ActionRowBuilder<ButtonBuilder>();
  for (let index = 0; index < Math.min(options.length, 5); index += 1) {
    const option = options[index]!;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(
          buildChoicePromptCustomId({
            sceneId: args.sceneId,
            key: args.key,
            nonce: args.nonce,
            optionIndex: index,
          })
        )
        .setLabel(option.label)
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return {
    content: `Awakening input needed: ${label}`,
    components: options.length > 0 ? [row] : [],
    ephemeral: true,
  };
}
