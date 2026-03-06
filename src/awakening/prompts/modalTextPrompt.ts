import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { PromptSpec } from "../../scripts/awakening/_schema.js";

export const AWAKEN_MODAL_OPEN_CUSTOM_ID_PREFIX = "awaken:modal_open";
export const AWAKEN_MODAL_SUBMIT_CUSTOM_ID_PREFIX = "awaken:modal_submit";

export type ParsedModalPromptCustomId = {
  sceneId: string;
  key: string;
  nonce: string;
};

export const AWAKEN_MODAL_INPUT_ID = "awaken_modal_text";

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

function parseId(prefix: string, customId: string): ParsedModalPromptCustomId | null {
  if (!customId.startsWith(`${prefix}:`)) return null;
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

export function buildModalOpenCustomId(args: { sceneId: string; key: string; nonce: string }): string {
  return buildId(AWAKEN_MODAL_OPEN_CUSTOM_ID_PREFIX, args);
}

export function parseModalOpenCustomId(customId: string): ParsedModalPromptCustomId | null {
  return parseId(AWAKEN_MODAL_OPEN_CUSTOM_ID_PREFIX, customId);
}

export function buildModalSubmitCustomId(args: { sceneId: string; key: string; nonce: string }): string {
  return buildId(AWAKEN_MODAL_SUBMIT_CUSTOM_ID_PREFIX, args);
}

export function parseModalSubmitCustomId(customId: string): ParsedModalPromptCustomId | null {
  return parseId(AWAKEN_MODAL_SUBMIT_CUSTOM_ID_PREFIX, customId);
}

export function buildModalTextPromptPayload(args: {
  prompt: PromptSpec;
  sceneId: string;
  key: string;
  nonce: string;
}): { content: string; components: ActionRowBuilder<ButtonBuilder>[]; ephemeral: true } {
  const label = toNonEmptyString((args.prompt as Record<string, unknown>).label) ?? "Enter text";

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildModalOpenCustomId({ sceneId: args.sceneId, key: args.key, nonce: args.nonce }))
      .setLabel("Open text prompt")
      .setStyle(ButtonStyle.Primary)
  );

  return {
    content: `Awakening input needed: ${label}`,
    components: [row],
    ephemeral: true,
  };
}

export function buildModalTextSubmitModal(args: {
  prompt: PromptSpec;
  sceneId: string;
  key: string;
  nonce: string;
}): ModalBuilder {
  const label = toNonEmptyString((args.prompt as Record<string, unknown>).label) ?? "Enter text";
  const modal = new ModalBuilder()
    .setCustomId(buildModalSubmitCustomId({ sceneId: args.sceneId, key: args.key, nonce: args.nonce }))
    .setTitle("Awakening Input")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(AWAKEN_MODAL_INPUT_ID)
          .setLabel(label.slice(0, 45))
          .setRequired(true)
          .setStyle(TextInputStyle.Short)
      )
    );
  return modal;
}
