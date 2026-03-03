import { PermissionFlagsBits } from "discord.js";
import {
  ensureGuildConfig,
  getGuildCanonPersonaMode,
  getGuildConfig,
  getGuildHomeTextChannelId,
  getGuildHomeVoiceChannelId,
  getGuildSetupVersion,
  resolveCampaignSlug,
  setGuildCanonPersonaMode,
  setGuildDefaultRecapStyle,
  setGuildHomeTextChannelId,
  setGuildHomeVoiceChannelId,
  setGuildSetupVersion,
} from "./guildConfig.js";

export type SetupReport = {
  applied: string[];
  warnings: string[];
  errors: string[];
  setupVersionChanged: boolean;
  canAttemptVoice: boolean;
};

export async function ensureGuildSetup(args: {
  guildId: string;
  guildName?: string | null;
  interaction: any;
}): Promise<SetupReport> {
  const applied: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  ensureGuildConfig(args.guildId, args.guildName ?? null);

  const guild = args.interaction.guild;
  const channel = args.interaction.channel;
  const botMember = guild?.members?.me ?? null;
  const invocationChannelId = args.interaction.channelId as string;

  if (!getGuildHomeTextChannelId(args.guildId)) {
    setGuildHomeTextChannelId(args.guildId, invocationChannelId);
    applied.push(`Bound home text to <#${invocationChannelId}>`);
  }

  if (!getGuildHomeVoiceChannelId(args.guildId)) {
    try {
      const invoker = await guild.members.fetch(args.interaction.user.id);
      const invokerVoiceChannelId = invoker.voice.channelId ?? null;
      if (invokerVoiceChannelId) {
        setGuildHomeVoiceChannelId(args.guildId, invokerVoiceChannelId);
        applied.push(`Bound home voice to <#${invokerVoiceChannelId}>`);
      }
    } catch {
      warnings.push("Could not inspect invoker voice channel for auto-bind");
    }
  }

  const campaignSlug = resolveCampaignSlug({ guildId: args.guildId, guildName: args.guildName ?? null });
  const hasCampaignSlug = typeof campaignSlug === "string" && campaignSlug.trim().length > 0;

  if (!getGuildCanonPersonaMode(args.guildId)) {
    setGuildCanonPersonaMode(args.guildId, "meta");
    applied.push("Initialized canon persona mode to meta");
  }

  const cfgNow = getGuildConfig(args.guildId);
  if (
    !cfgNow?.default_recap_style ||
    !["balanced", "concise", "detailed"].includes(cfgNow.default_recap_style)
  ) {
    setGuildDefaultRecapStyle(args.guildId, "balanced");
    applied.push("Initialized default recap style to balanced");
  }

  const textPerms = channel && botMember ? channel.permissionsFor(botMember) : null;
  const canSend = Boolean(textPerms?.has(PermissionFlagsBits.SendMessages));
  const canEmbed = Boolean(textPerms?.has(PermissionFlagsBits.EmbedLinks));
  const canAttach = Boolean(textPerms?.has(PermissionFlagsBits.AttachFiles));

  if (!canSend) {
    errors.push("Missing Send Messages permission in this channel");
  }
  if (!canEmbed) {
    warnings.push("Missing Embed Links permission in this channel");
  }
  if (!canAttach) {
    warnings.push("Missing Attach Files permission in this channel");
  }

  let canAttemptVoice = true;
  const homeVoiceId = getGuildHomeVoiceChannelId(args.guildId);
  if (homeVoiceId) {
    try {
      const voiceChannel = await guild.channels.fetch(homeVoiceId);
      if (!voiceChannel || !voiceChannel.isVoiceBased()) {
        warnings.push("Home voice channel is missing or not a voice channel");
        canAttemptVoice = false;
      } else {
        const voicePerms = voiceChannel.permissionsFor(botMember);
        const canConnect = Boolean(voicePerms?.has(PermissionFlagsBits.Connect));
        const canSpeak = Boolean(voicePerms?.has(PermissionFlagsBits.Speak));
        if (!canConnect || !canSpeak) {
          warnings.push("Missing Connect/Speak permission in home voice channel");
          canAttemptVoice = false;
        }
      }
    } catch {
      warnings.push("Could not validate home voice channel permissions");
      canAttemptVoice = false;
    }
  }

  const hasSafeElevatedPolicy = true;
  if (!hasSafeElevatedPolicy) {
    errors.push("No elevated auth policy configured");
  }

  if (!hasCampaignSlug) {
    errors.push("Campaign slug missing");
  }

  const requiredChecksPass = canSend && hasSafeElevatedPolicy && hasCampaignSlug;
  const previousSetupVersion = getGuildSetupVersion(args.guildId);
  let setupVersionChanged = false;
  if (requiredChecksPass && (previousSetupVersion ?? 0) < 1) {
    setGuildSetupVersion(args.guildId, 1);
    setupVersionChanged = true;
    applied.push("Setup version initialized to 1");
  }

  return {
    applied,
    warnings,
    errors,
    setupVersionChanged,
    canAttemptVoice,
  };
}
