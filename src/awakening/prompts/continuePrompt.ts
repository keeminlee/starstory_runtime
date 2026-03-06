import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const AWAKEN_CONTINUE_CUSTOM_ID_PREFIX = "meepo_awaken_continue";
export const AWAKEN_CONTINUE_KEY = "__continue__";

export type ParsedContinueCustomId = {
  guildId: string;
  onboardingId: string;
  sceneId: string;
  nonce: string;
};

export function buildContinueCustomId(args: {
  guildId: string;
  onboardingId: string;
  sceneId: string;
  nonce: string;
}): string {
  return [
    AWAKEN_CONTINUE_CUSTOM_ID_PREFIX,
    encodeURIComponent(args.guildId),
    encodeURIComponent(args.onboardingId),
    encodeURIComponent(args.sceneId),
    encodeURIComponent(args.nonce),
  ].join(":");
}

export function parseContinueCustomId(customId: string): ParsedContinueCustomId | null {
  if (!customId.startsWith(`${AWAKEN_CONTINUE_CUSTOM_ID_PREFIX}:`)) return null;
  const parts = customId.split(":");
  if (parts.length !== 5) return null;

  try {
    const guildId = decodeURIComponent(parts[1] ?? "").trim();
    const onboardingId = decodeURIComponent(parts[2] ?? "").trim();
    const sceneId = decodeURIComponent(parts[3] ?? "").trim();
    const nonce = decodeURIComponent(parts[4] ?? "").trim();
    if (!guildId || !onboardingId || !sceneId || !nonce) return null;
    return { guildId, onboardingId, sceneId, nonce };
  } catch {
    return null;
  }
}

export function buildContinuePromptPayload(args: {
  guildId: string;
  onboardingId: string;
  sceneId: string;
  nonce: string;
}): {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
  ephemeral: false;
} {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildContinueCustomId(args))
      .setLabel("Continue (DM)")
      .setStyle(ButtonStyle.Primary)
  );

  return {
    content: "Continue when the table is ready.",
    components: [row],
    ephemeral: false,
  };
}