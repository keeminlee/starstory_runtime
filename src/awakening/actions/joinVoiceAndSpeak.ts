import { joinVoice } from "../../voice/connection.js";
import { speakInGuild } from "../../voice/speaker.js";
import { getVoiceState, setVoiceState } from "../../voice/state.js";
import { getTtsProvider } from "../../voice/tts/provider.js";
import type { ActionSpec } from "../../scripts/awakening/_schema.js";
import type { GuildOnboardingState } from "../../ledger/awakeningStateRepo.js";
import type { AwakeningActionErrorCode } from "./index.js";

type JoinVoiceActionResult = {
  ok: boolean;
  code?: AwakeningActionErrorCode;
};

async function postFallbackLine(interaction: any, line: string): Promise<void> {
  try {
    if (typeof interaction?.followUp === "function") {
      await interaction.followUp({ content: line, ephemeral: false });
      return;
    }
    if (interaction?.channel?.send) {
      await interaction.channel.send({ content: line });
    }
  } catch {
    // best-effort only
  }
}

export async function executeJoinVoiceAndSpeakAction(args: {
  db: any;
  interaction: any;
  state: GuildOnboardingState;
  action: ActionSpec;
}): Promise<JoinVoiceActionResult> {
  const channelKey = typeof args.action.channel_key === "string" ? args.action.channel_key.trim() : "";
  const lines = Array.isArray(args.action.lines)
    ? args.action.lines.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    : [];
  const fallbackLine = lines[0] ?? "I could not join voice right now, but awakening will continue.";

  if (!channelKey) {
    await postFallbackLine(args.interaction, fallbackLine);
    return { ok: false, code: "VOICE_CHANNEL_MISSING" };
  }

  const channelIdRaw = args.state.progress_json[channelKey];
  const channelId = typeof channelIdRaw === "string" ? channelIdRaw.trim() : "";
  if (!channelId) {
    await postFallbackLine(args.interaction, fallbackLine);
    return { ok: false, code: "VOICE_CHANNEL_MISSING" };
  }

  const guild = args.interaction?.guild;
  if (!guild?.channels?.fetch) {
    await postFallbackLine(args.interaction, fallbackLine);
    return { ok: false, code: "VOICE_CHANNEL_FETCH_FAILED" };
  }

  let voiceChannel: any;
  try {
    voiceChannel = await guild.channels.fetch(channelId);
  } catch {
    await postFallbackLine(args.interaction, fallbackLine);
    return { ok: false, code: "VOICE_CHANNEL_FETCH_FAILED" };
  }

  if (!voiceChannel || !voiceChannel.isVoiceBased?.()) {
    await postFallbackLine(args.interaction, fallbackLine);
    return { ok: false, code: "VOICE_CHANNEL_INVALID" };
  }

  try {
    const existing = getVoiceState(args.state.guild_id);
    if (!existing || existing.channelId !== channelId) {
      const connection = await joinVoice({
        guildId: args.state.guild_id,
        channelId,
        adapterCreator: guild.voiceAdapterCreator,
      });

      setVoiceState(args.state.guild_id, {
        channelId,
        connection,
        guild,
        sttEnabled: true,
        hushEnabled: true,
        connectedAt: Date.now(),
      });
    }
  } catch {
    await postFallbackLine(args.interaction, fallbackLine);
    return { ok: false, code: "VOICE_JOIN_FAILED" };
  }

  try {
    if (lines.length > 0) {
      const tts = await getTtsProvider();
      for (const line of lines) {
        const audio = await tts.synthesize(line);
        speakInGuild(args.state.guild_id, audio);
      }
    }
  } catch {
    await postFallbackLine(args.interaction, fallbackLine);
    return { ok: false, code: "VOICE_TTS_FAILED" };
  }

  return { ok: true };
}
