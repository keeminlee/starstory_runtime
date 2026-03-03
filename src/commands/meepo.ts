import fs from "node:fs";
import { AttachmentBuilder, GuildMember, SlashCommandBuilder } from "discord.js";
import {
  getGuildHomeTextChannelId,
  getGuildHomeVoiceChannelId,
  resolveGuildHomeVoiceChannelId,
  setGuildHomeTextChannelId,
  setGuildHomeVoiceChannelId,
} from "../campaign/guildConfig.js";
import { cfg } from "../config/env.js";
import { getPersona } from "../personas/index.js";
import { logSystemEvent } from "../ledger/system.js";
import { wakeMeepo, getActiveMeepo, sleepMeepo } from "../meepo/state.js";
import { getEffectivePersonaId } from "../meepo/personaState.js";
import { isElevated } from "../security/isElevated.js";
import {
  endSession,
  getActiveSession,
  getSessionArtifact,
  getSessionArtifactMap,
  getSessionById,
  listSessions,
  startSession,
} from "../sessions/sessions.js";
import { generateSessionRecap } from "../sessions/recapEngine.js";
import type { RecapStrategy } from "../sessions/recapEngine.js";
import {
  getAllFinalStatuses,
  getBaseStatus,
  getFinalStatus,
  type RecapPassStrategy,
} from "../sessions/megameecapArtifactLocator.js";
import { resolveEffectiveMode } from "../sessions/sessionRuntime.js";
import { joinVoice, leaveVoice } from "../voice/connection.js";
import { startReceiver, stopReceiver } from "../voice/receiver.js";
import {
  getVoiceState,
  isVoiceHushEnabled,
  setVoiceHushEnabled,
  setVoiceState,
} from "../voice/state.js";
import { getSttProviderInfo } from "../voice/stt/provider.js";
import { getTtsProviderInfo } from "../voice/tts/provider.js";
import { voicePlaybackController } from "../voice/voicePlaybackController.js";
import type { CommandCtx } from "./index.js";

type SessionRow = {
  session_id: string;
  label: string | null;
  kind: "canon" | "chat";
  mode_at_start: "canon" | "ambient" | "lab" | "dormant";
  started_at_ms: number;
  ended_at_ms: number | null;
};

type SessionArtifactRow = {
  id: string;
  session_id: string;
  artifact_type: string;
  created_at_ms: number;
  engine: string | null;
  source_hash: string | null;
  strategy: string | null;
  strategy_version: string | null;
  meta_json: string | null;
  content_text: string | null;
  file_path: string | null;
  size_bytes: number | null;
};

const DEFAULT_RECAP_STRATEGY: RecapStrategy = "balanced";
const RECAP_STRATEGIES: RecapStrategy[] = ["detailed", "balanced", "concise"];

function setReplyMode(db: any, guildId: string, mode: "voice" | "text"): void {
  db.prepare(
    `
      UPDATE npc_instances
      SET reply_mode = ?
      WHERE guild_id = ? AND is_active = 1
    `
  ).run(mode, guildId);
}

function hasTtsAvailable(): boolean {
  const info = getTtsProviderInfo();
  return cfg.tts.enabled && info.name !== "noop";
}

function formatChannel(channelId: string | null): string {
  if (!channelId) return "(unset)";
  return `<#${channelId}>`;
}

function summarizeSession(session: SessionRow): string {
  const label = getSessionDisplayLabel(session);
  const status = session.ended_at_ms ? "ended" : "active";
  return `${label} (${status})`;
}

function getSessionDisplayLabel(session: Pick<SessionRow, "label">): string {
  const label = session.label?.trim();
  return label && label.length > 0 ? label : "Unlabeled Session";
}

function getSessionKindTag(session: Pick<SessionRow, "kind">): "CANON" | "AMBIENT" {
  return session.kind === "canon" ? "CANON" : "AMBIENT";
}

function canGenerateRecap(session: Pick<SessionRow, "kind" | "mode_at_start">): boolean {
  return session.kind === "canon" && session.mode_at_start !== "lab";
}

function formatRecapStatusForList(session: SessionRow, recap: SessionArtifactRow | null): string {
  if (!canGenerateRecap(session)) return "—";
  return recap ? "✅" : "❌";
}

function formatSessionChoice(session: SessionRow, idx: number): { name: string; value: string } {
  const label = session.label ?? "(unlabeled)";
  const date = new Date(session.started_at_ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const idShort = String(session.session_id).slice(0, 8);
  return {
    name: `#${idx + 1} — ${label} (${date}, ${idShort})`.slice(0, 100),
    value: String(session.session_id),
  };
}

async function ensureVoiceConnection(interaction: any, guildId: string): Promise<{
  joinedVoiceChannelId: string | null;
  stayPutNotice: string | null;
  notInVoiceNotice: string | null;
}> {
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);
  const invokerVoiceChannelId = member.voice.channelId ?? null;
  const currentVoiceState = getVoiceState(guildId);

  if (currentVoiceState) {
    startReceiver(guildId);
    setVoiceHushEnabled(guildId, true);
    return {
      joinedVoiceChannelId: null,
      stayPutNotice:
        invokerVoiceChannelId && invokerVoiceChannelId !== currentVoiceState.channelId
          ? `I am already in ${formatChannel(currentVoiceState.channelId)} and will stay put. Change home voice via /meepo settings set.`
          : null,
      notInVoiceNotice: null,
    };
  }

  if (!invokerVoiceChannelId) {
    return {
      joinedVoiceChannelId: null,
      stayPutNotice: null,
      notInVoiceNotice: "Join a voice channel and run /meepo wake again if you want me to connect.",
    };
  }

  const connection = await joinVoice({
    guildId,
    channelId: invokerVoiceChannelId,
    adapterCreator: guild.voiceAdapterCreator,
  });

  setVoiceState(guildId, {
    channelId: invokerVoiceChannelId,
    connection,
    guild,
    sttEnabled: true,
    hushEnabled: true,
    connectedAt: Date.now(),
  });

  startReceiver(guildId);

  if (!getGuildHomeVoiceChannelId(guildId)) {
    setGuildHomeVoiceChannelId(guildId, invokerVoiceChannelId);
  }

  return {
    joinedVoiceChannelId: invokerVoiceChannelId,
    stayPutNotice: null,
    notInVoiceNotice: null,
  };
}

async function handleWake(interaction: any, ctx: CommandCtx): Promise<void> {
  const guildId = interaction.guildId as string;
  const invocationChannelId = interaction.channelId as string;
  const requestedSessionLabel = interaction.options.getString("session")?.trim() ?? null;

  if (!getGuildHomeTextChannelId(guildId)) {
    setGuildHomeTextChannelId(guildId, invocationChannelId);
  }

  if (!getActiveMeepo(guildId)) {
    wakeMeepo({ guildId, channelId: invocationChannelId });
  }

  const { joinedVoiceChannelId, stayPutNotice, notInVoiceNotice } = await ensureVoiceConnection(
    interaction,
    guildId
  );

  setReplyMode(ctx.db, guildId, "text");
  setVoiceHushEnabled(guildId, true);

  const previousSession = getActiveSession(guildId);
  let startedSession: SessionRow | null = null;
  let endedPrevious = false;

  if (previousSession) {
    if (requestedSessionLabel) {
      endSession(guildId, "session_switch");
      endedPrevious = true;
      logSystemEvent({
        guildId,
        channelId: invocationChannelId,
        eventType: "SESSION_ENDED",
        content: JSON.stringify({ id: previousSession.session_id }),
        authorId: interaction.user.id,
        authorName: interaction.user.username,
        narrativeWeight: "secondary",
      });
    } else {
      endSession(guildId, "wake_ambient");
      endedPrevious = true;
      logSystemEvent({
        guildId,
        channelId: invocationChannelId,
        eventType: "SESSION_ENDED",
        content: JSON.stringify({ id: previousSession.session_id }),
        authorId: interaction.user.id,
        authorName: interaction.user.username,
        narrativeWeight: "secondary",
      });
    }
  }

  if (requestedSessionLabel) {
    startedSession = startSession(guildId, interaction.user.id, interaction.user.username, {
      label: requestedSessionLabel,
      source: "live",
      modeAtStart: "canon",
      kind: "canon",
    }) as SessionRow;

    logSystemEvent({
      guildId,
      channelId: invocationChannelId,
      eventType: "SESSION_STARTED",
      content: JSON.stringify({ id: startedSession.session_id, label: startedSession.label }),
      authorId: interaction.user.id,
      authorName: interaction.user.username,
      narrativeWeight: "secondary",
    });
  }

  const activeSession = getActiveSession(guildId) as SessionRow | null;
  const effectiveMode = resolveEffectiveMode(guildId);
  const effectivePersonaId = getEffectivePersonaId(guildId);
  const effectivePersona = getPersona(effectivePersonaId);
  const homeText = getGuildHomeTextChannelId(guildId);
  const homeVoice = resolveGuildHomeVoiceChannelId(guildId, cfg.overlay.homeVoiceChannelId ?? null);

  const responseLines: string[] = [];

  if (startedSession) {
    if (endedPrevious) {
      responseLines.push("🧾 Previous session ended.");
    }
    responseLines.push(`🎬 Session started: "${startedSession.label}"`);
    responseLines.push(`Mode: ${effectiveMode === "canon" ? "Canon" : effectiveMode} (listening only)`);
  } else if (activeSession) {
    responseLines.push("🧠 Meepo is awake.");
    responseLines.push(`Mode: Canon (active session: ${getSessionDisplayLabel(activeSession)})`);
  } else {
    responseLines.push("🧠 Meepo is awake.");
    if (endedPrevious) {
      responseLines.push("🧾 Previous session ended.");
    }
    responseLines.push("Mode: Ambient");
  }

  responseLines.push(`Persona: ${effectivePersona.displayName} (${effectivePersonaId})`);
  responseLines.push(`Home text: ${formatChannel(homeText)}`);
  responseLines.push(`Home voice: ${formatChannel(homeVoice)}`);
  if (joinedVoiceChannelId) {
    responseLines.push(`Joined voice: ${formatChannel(joinedVoiceChannelId)}`);
  }
  if (stayPutNotice) responseLines.push(stayPutNotice);
  if (notInVoiceNotice) responseLines.push(notInVoiceNotice);

  await interaction.reply({ content: responseLines.join("\n"), ephemeral: true });
}

async function handleSleep(interaction: any): Promise<void> {
  const guildId = interaction.guildId as string;
  const activeSession = getActiveSession(guildId) as SessionRow | null;

  if (activeSession) {
    endSession(guildId, "sleep");
    logSystemEvent({
      guildId,
      channelId: interaction.channelId,
      eventType: "SESSION_ENDED",
      content: JSON.stringify({ id: activeSession.session_id }),
      authorId: interaction.user.id,
      authorName: interaction.user.username,
      narrativeWeight: "secondary",
    });
  }

  const currentVoiceState = getVoiceState(guildId);
  if (currentVoiceState) {
    stopReceiver(guildId);
    leaveVoice(guildId);
  }

  const changed = sleepMeepo(guildId);

  if (!changed && !activeSession) {
    await interaction.reply({ content: "Meepo is already asleep.", ephemeral: true });
    return;
  }

  if (activeSession) {
    await interaction.reply({
      content: `🧾 Session ended: "${getSessionDisplayLabel(activeSession)}"\nTranscript saved.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({ content: "😴 Meepo is asleep.", ephemeral: true });
}

async function handleTalk(interaction: any, ctx: CommandCtx): Promise<void> {
  const guildId = interaction.guildId as string;
  const active = getActiveMeepo(guildId);
  if (!active) {
    await interaction.reply({ content: "Meepo is asleep. Use /meepo wake first.", ephemeral: true });
    return;
  }

  const currentVoiceState = getVoiceState(guildId);
  if (!currentVoiceState) {
    await interaction.reply({
      content: "Meepo is not connected to voice. Use /meepo wake while you are in voice.",
      ephemeral: true,
    });
    return;
  }

  if (!hasTtsAvailable()) {
    setReplyMode(ctx.db, guildId, "text");
    setVoiceHushEnabled(guildId, true);
    const ttsInfo = getTtsProviderInfo();
    await interaction.reply({
      content:
        "TTS is unavailable, staying in hush mode. " +
        `Current provider: ${ttsInfo.name}. Configure TTS_ENABLED=1 and a non-noop TTS_PROVIDER.`,
      ephemeral: true,
    });
    return;
  }

  setReplyMode(ctx.db, guildId, "voice");
  setVoiceHushEnabled(guildId, false);

  await interaction.reply({
    content: "Talk mode enabled. Meepo can now reply in voice.",
    ephemeral: true,
  });
}

async function handleHush(interaction: any, ctx: CommandCtx): Promise<void> {
  const guildId = interaction.guildId as string;
  const active = getActiveMeepo(guildId);
  if (!active) {
    await interaction.reply({ content: "Meepo is asleep. Use /meepo wake first.", ephemeral: true });
    return;
  }

  const voiceState = getVoiceState(guildId);
  if (voiceState) {
    setVoiceHushEnabled(guildId, true);
    voicePlaybackController.abort(guildId, "hush_mode_enabled", {
      channelId: voiceState.channelId,
      authorId: interaction.user.id,
      authorName: interaction.user.username,
      source: "command",
      logSystemEvent: true,
    });
  }

  setReplyMode(ctx.db, guildId, "text");

  await interaction.reply({
    content: "Hush mode enabled. Meepo will stay listen-only.",
    ephemeral: true,
  });
}

async function handleSessionsRecap(interaction: any): Promise<void> {
  const guildId = interaction.guildId as string;
  const sessionId = interaction.options.getString("session", true);
  const force = interaction.options.getBoolean("force") ?? false;
  const strategy = (interaction.options.getString("style") ?? DEFAULT_RECAP_STRATEGY) as RecapStrategy;

  const session = getSessionById(guildId, sessionId) as SessionRow | null;
  if (!session) {
    await interaction.reply({ content: "Session not found.", ephemeral: true });
    return;
  }

  if (!canGenerateRecap(session)) {
    await interaction.reply({
      content: "Recaps are available only for canon sessions (non-lab).",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  logSystemEvent({
    guildId,
    channelId: interaction.channelId,
    eventType: "SESSION_RECAP_REQUESTED",
    content: JSON.stringify({ id: session.session_id, force, strategy }),
    authorId: interaction.user.id,
    authorName: interaction.user.username,
    narrativeWeight: "secondary",
  });

  const recap = await generateSessionRecap({
    guildId,
    sessionId: session.session_id,
    force,
    strategy,
  });

  const sessionLabel = getSessionDisplayLabel(session);
  const previewText = recap.text.length > 700 ? `${recap.text.slice(0, 700)}…` : recap.text;
  const fileName = `session-${session.session_id}-recap-${strategy}.md`;
  const file = new AttachmentBuilder(Buffer.from(recap.text, "utf8"), { name: fileName });

  await interaction.editReply({
    content: [
      `${recap.cacheHit ? "📦 Cached" : "📜 Generated"} recap for \"${sessionLabel}\".`,
      `Style: ${recap.strategy} (${recap.finalVersion})`,
      `Base version: ${recap.baseVersion}`,
      `Source hash: ${recap.sourceTranscriptHash.slice(0, 12)}…`,
      "",
      "Preview:",
      previewText,
    ].join("\n"),
    files: [file],
  });
}

async function handleSessions(interaction: any, ctx: CommandCtx): Promise<void> {
  const guildId = interaction.guildId as string;
  const sub = interaction.options.getSubcommand();

  if (sub === "list") {
    const limit = interaction.options.getInteger("limit") ?? 10;
    const rows = listSessions(guildId, limit) as SessionRow[];
    if (rows.length === 0) {
      await interaction.reply({ content: "No sessions found.", ephemeral: true });
      return;
    }

    const recapBySession = getSessionArtifactMap(
      guildId,
      rows.map((session) => session.session_id),
      "recap_final"
    );

    const lines = rows.map((session, index) => {
      const date = new Date(session.started_at_ms).toISOString().replace("T", " ").slice(0, 16);
      const recap = recapBySession.get(session.session_id) as SessionArtifactRow | undefined;
      return `#${index + 1} ${date} \"${getSessionDisplayLabel(session)}\" [${getSessionKindTag(session)}] recap: ${formatRecapStatusForList(session, recap ?? null)}`;
    });

    await interaction.reply({ content: lines.join("\n"), ephemeral: true });
    return;
  }

  if (sub === "view") {
    const sessionId = interaction.options.getString("session", true);
    const session = getSessionById(guildId, sessionId) as SessionRow | null;

    if (!session) {
      await interaction.reply({ content: "Session not found.", ephemeral: true });
      return;
    }

    const recap = getSessionArtifact(guildId, session.session_id, "recap_final") as SessionArtifactRow | null;
    const transcriptArtifact = getSessionArtifact(
      guildId,
      session.session_id,
      "transcript_export"
    ) as SessionArtifactRow | null;
    const effectiveCampaignSlug = ctx.campaignSlug;

    const baseStatus = getBaseStatus(effectiveCampaignSlug, session.session_id);
    const finalFileForDbStyle =
      recap && recap.strategy && RECAP_STRATEGIES.includes(recap.strategy as RecapPassStrategy)
        ? getFinalStatus(effectiveCampaignSlug, session.session_id, recap.strategy as RecapPassStrategy)
        : getFinalStatus(effectiveCampaignSlug, session.session_id);
    const allFinalFiles = getAllFinalStatuses(effectiveCampaignSlug, session.session_id);
    const hasAnyFinalFiles = allFinalFiles.some((status) => status.exists);

    const recapExists = Boolean(recap);
    const transcriptStatus = transcriptArtifact ? "available" : "not cached yet";

    let recapMeta: Record<string, unknown> = {};
    try {
      recapMeta = recap?.meta_json ? (JSON.parse(recap.meta_json) as Record<string, unknown>) : {};
    } catch {
      recapMeta = {};
    }

    const finalStyle = (recapMeta.final_style as string | undefined) ?? recap?.strategy ?? "(n/a)";
    const finalVersion =
      (recapMeta.final_version as string | undefined) ?? recap?.strategy_version ?? "(n/a)";
    const baseVersion = (recapMeta.base_version as string | undefined) ?? "(n/a)";

    const lines = [
      `Session: ${session.session_id}`,
      `Label: ${getSessionDisplayLabel(session)}`,
      `Started: ${new Date(session.started_at_ms).toISOString()}`,
      `Ended: ${session.ended_at_ms ? new Date(session.ended_at_ms).toISOString() : "(active)"}`,
      `Kind: ${session.kind}`,
      `Base cache: ${baseStatus.exists ? "✅" : "❌"}`,
      `Base hash: ${baseStatus.sourceHash ? `${baseStatus.sourceHash.slice(0, 12)}…` : "(n/a)"}`,
      `Base version: ${baseStatus.baseVersion ?? "(n/a)"}`,
      `Most recent final: ${recapExists ? "✅" : "❌"}`,
      `Final style: ${finalStyle}`,
      `Final created_at: ${recap?.created_at_ms ? new Date(recap.created_at_ms).toISOString() : "(n/a)"}`,
      `Final hash: ${recap?.source_hash ? `${recap.source_hash.slice(0, 12)}…` : "(n/a)"}`,
      `Final version: ${finalVersion}`,
      `Linked base version: ${baseVersion}`,
      `Transcript export: ${transcriptStatus}`,
    ];

    if (recapExists && !finalFileForDbStyle.exists) {
      lines.push("Final DB row exists but final file is missing; regenerate to repair index + files.");
    }

    if (!recapExists && hasAnyFinalFiles) {
      lines.push("Final file(s) present but unindexed in DB (not canonical most recent). Regenerate to index canonically.");
    }

    if (!baseStatus.exists && canGenerateRecap(session)) {
      lines.push(`Next: Generate recap (builds base) via /meepo sessions recap session:${session.session_id} style:${DEFAULT_RECAP_STRATEGY}`);
    } else if (!recapExists && canGenerateRecap(session)) {
      lines.push(`Next: Generate final recap (cheap) via /meepo sessions recap session:${session.session_id} style:${DEFAULT_RECAP_STRATEGY}`);
    } else if (recapExists) {
      lines.push(`Next: Regenerate via /meepo sessions recap session:${session.session_id} style:${DEFAULT_RECAP_STRATEGY} force:true`);
    }

    if (!transcriptArtifact) {
      lines.push("Transcript export not cached yet.");
    }

    const files: AttachmentBuilder[] = [];
    if (recap) {
      const fileName = `session-${session.session_id}-recap-final-${recap.strategy ?? DEFAULT_RECAP_STRATEGY}.md`;
      if (finalFileForDbStyle.exists && finalFileForDbStyle.paths?.recapPath && fs.existsSync(finalFileForDbStyle.paths.recapPath)) {
        files.push(
          new AttachmentBuilder(fs.readFileSync(finalFileForDbStyle.paths.recapPath), {
            name: fileName,
          })
        );
      } else if (recap.content_text) {
        files.push(
          new AttachmentBuilder(Buffer.from(recap.content_text, "utf8"), {
            name: fileName,
          })
        );
      }
    }

    if (transcriptArtifact?.content_text) {
      files.push(
        new AttachmentBuilder(Buffer.from(transcriptArtifact.content_text, "utf8"), {
          name: `session-${session.session_id}-transcript.txt`,
        })
      );
    }

    await interaction.reply({
      content: lines.join("\n"),
      files,
      ephemeral: true,
    });
    return;
  }

  if (sub === "recap") {
    await handleSessionsRecap(interaction);
    return;
  }

  await interaction.reply({ content: "Unknown sessions action.", ephemeral: true });
}

async function handleSettings(interaction: any): Promise<void> {
  const guildId = interaction.guildId as string;
  const sub = interaction.options.getSubcommand();

  if (sub === "show") {
    const homeText = getGuildHomeTextChannelId(guildId);
    const homeVoice = resolveGuildHomeVoiceChannelId(guildId, cfg.overlay.homeVoiceChannelId ?? null);
    await interaction.reply({
      content: [
        "Meepo settings:",
        `- home_text_channel: ${formatChannel(homeText)}`,
        `- home_voice_channel: ${formatChannel(homeVoice)}`,
      ].join("\n"),
      ephemeral: true,
    });
    return;
  }

  if (sub === "set") {
    const key = interaction.options.getString("key", true);
    const channel = interaction.options.getChannel("channel", true);

    if (key === "home_text_channel") {
      setGuildHomeTextChannelId(guildId, channel.id);
      await interaction.reply({ content: `Set home text channel to ${formatChannel(channel.id)}.`, ephemeral: true });
      return;
    }

    if (key === "home_voice_channel") {
      setGuildHomeVoiceChannelId(guildId, channel.id);
      await interaction.reply({ content: `Set home voice channel to ${formatChannel(channel.id)}.`, ephemeral: true });
      return;
    }
  }

  if (sub === "clear") {
    const key = interaction.options.getString("key", true);

    if (key === "home_text_channel") {
      setGuildHomeTextChannelId(guildId, null);
      await interaction.reply({ content: "Cleared home text channel.", ephemeral: true });
      return;
    }

    if (key === "home_voice_channel") {
      setGuildHomeVoiceChannelId(guildId, null);
      await interaction.reply({ content: "Cleared home voice channel.", ephemeral: true });
      return;
    }
  }

  await interaction.reply({ content: "Unknown settings action.", ephemeral: true });
}

async function handleStatus(interaction: any, ctx: CommandCtx): Promise<void> {
  const guildId = interaction.guildId as string;
  const active = getActiveMeepo(guildId);
  const voiceState = getVoiceState(guildId);
  const homeText = getGuildHomeTextChannelId(guildId);
  const homeVoice = resolveGuildHomeVoiceChannelId(guildId, cfg.overlay.homeVoiceChannelId ?? null);
  const sttInfo = getSttProviderInfo();
  const ttsInfo = getTtsProviderInfo();
  const effectiveMode = resolveEffectiveMode(guildId);
  const effectivePersonaId = getEffectivePersonaId(guildId);
  const effectivePersona = getPersona(effectivePersonaId);

  const activeSession = getActiveSession(guildId) as SessionRow | null;

  const lastTranscriptionRow = ctx.db
    .prepare(
      `
      SELECT MAX(timestamp_ms) AS ts
      FROM ledger_entries
      WHERE guild_id = ?
        AND tags LIKE '%voice%'
      `
    )
    .get(guildId) as { ts: number | null } | undefined;

  const awake = Boolean(active);
  const talkMode = awake && active?.reply_mode === "voice" && Boolean(voiceState) && !isVoiceHushEnabled(guildId);
  const voiceMode = awake ? (talkMode ? "talk" : "hush") : "asleep";

  const hints: string[] = [];
  if (awake && !voiceState) {
    hints.push("Join voice and run /meepo wake to connect voice.");
  }
  if (!hasTtsAvailable()) {
    hints.push("Configure TTS_ENABLED=1 and a non-noop TTS_PROVIDER for /meepo talk.");
  }
  if (!homeText) {
    hints.push("Set home text with /meepo settings set key:home_text_channel.");
  }

  await interaction.reply({
    content: [
      `State: ${awake ? "awake" : "asleep"} (${voiceMode})`,
      `Effective mode: ${effectiveMode}`,
      `Effective persona: ${effectivePersona.displayName} (${effectivePersonaId})`,
      `Active session: ${activeSession ? summarizeSession(activeSession) : "(none)"}`,
      `Home text: ${formatChannel(homeText)}`,
      `Home voice: ${formatChannel(homeVoice)}`,
      `Connected voice: ${formatChannel(voiceState?.channelId ?? null)}`,
      `STT active: ${voiceState?.sttEnabled ? "yes" : "no"} (${sttInfo.name})`,
      `Last transcription: ${lastTranscriptionRow?.ts ? new Date(lastTranscriptionRow.ts).toISOString() : "(none)"}`,
      `TTS available: ${hasTtsAvailable() ? "yes" : "no"} (${ttsInfo.name})`,
      hints.length > 0 ? `Fix hints: ${hints.join(" | ")}` : "Fix hints: none",
    ].join("\n"),
    ephemeral: false,
  });
}

export const meepo = {
  data: new SlashCommandBuilder()
    .setName("meepo")
    .setDescription("Minimal Meepo controls.")
    .addSubcommand((sub) =>
      sub
        .setName("wake")
        .setDescription("Wake Meepo; optionally start a canon session.")
        .addStringOption((opt) =>
          opt
            .setName("session")
            .setDescription("Optional session label to start canon mode.")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) => sub.setName("sleep").setDescription("Put Meepo to sleep and end active session."))
    .addSubcommandGroup((group) =>
      group
        .setName("sessions")
        .setDescription("Browse sessions.")
        .addSubcommand((sub) =>
          sub
            .setName("list")
            .setDescription("List recent sessions.")
            .addIntegerOption((opt) =>
              opt
                .setName("limit")
                .setDescription("How many sessions to show (default 10, max 50).")
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(50)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("view")
            .setDescription("View a session by id.")
            .addStringOption((opt) =>
              opt
                .setName("session")
                .setDescription("Session id")
                .setAutocomplete(true)
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("recap")
            .setDescription("Generate or regenerate a recap for a canon session.")
            .addStringOption((opt) =>
              opt
                .setName("session")
                .setDescription("Session id")
                .setAutocomplete(true)
                .setRequired(true)
            )
            .addStringOption((opt) =>
              opt
                .setName("style")
                .setDescription("Final recap style")
                .setRequired(false)
                .addChoices(
                  { name: "detailed", value: "detailed" },
                  { name: "balanced", value: "balanced" },
                  { name: "concise", value: "concise" }
                )
            )
            .addBooleanOption((opt) =>
              opt
                .setName("force")
                .setDescription("Force regeneration even if a recap already exists.")
                .setRequired(false)
            )
        )
    )
    .addSubcommand((sub) => sub.setName("talk").setDescription("Enable voice replies (requires awake)."))
    .addSubcommand((sub) => sub.setName("hush").setDescription("Disable voice replies (requires awake)."))
    .addSubcommand((sub) => sub.setName("status").setDescription("Show current Meepo state and diagnostics."))
    .addSubcommandGroup((group) =>
      group
        .setName("settings")
        .setDescription("Show or edit Meepo home channels.")
        .addSubcommand((sub) => sub.setName("show").setDescription("Show saved home channels."))
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Set a home channel.")
            .addStringOption((opt) =>
              opt
                .setName("key")
                .setDescription("Setting key")
                .setRequired(true)
                .addChoices(
                  { name: "home_text_channel", value: "home_text_channel" },
                  { name: "home_voice_channel", value: "home_voice_channel" }
                )
            )
            .addChannelOption((opt) =>
              opt.setName("channel").setDescription("Channel value").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("clear")
            .setDescription("Clear a saved home channel.")
            .addStringOption((opt) =>
              opt
                .setName("key")
                .setDescription("Setting key")
                .setRequired(true)
                .addChoices(
                  { name: "home_text_channel", value: "home_text_channel" },
                  { name: "home_voice_channel", value: "home_voice_channel" }
                )
            )
        )
    ),

  async autocomplete(interaction: any) {
    const guildId = interaction.guildId as string | null;
    if (!guildId) {
      await interaction.respond([]);
      return;
    }

    const focused = interaction.options.getFocused(true);
    if (focused.name !== "session") {
      await interaction.respond([]);
      return;
    }

    const subGroup = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand(false);
    const supportsAutocomplete =
      subGroup === "sessions" && (sub === "view" || sub === "recap");

    if (!supportsAutocomplete) {
      await interaction.respond([]);
      return;
    }

    const query = String(focused.value ?? "").trim().toLowerCase();
    const sessions = listSessions(guildId, 25) as SessionRow[];

    const options = sessions
      .filter((session) => {
        if (!query) return true;
        const label = (session.label ?? "").toLowerCase();
        return label.includes(query) || session.session_id.toLowerCase().includes(query);
      })
      .slice(0, 25)
      .map((session, index) => formatSessionChoice(session, index));

    await interaction.respond(options);
  },

  async execute(interaction: any, ctx: CommandCtx | null) {
    const guildId = interaction.guildId as string | null;
    const guild = interaction.guild;
    if (!guildId || !guild || !ctx?.db) {
      await interaction.reply({ content: "Meepo only works in a server (not DMs).", ephemeral: true });
      return;
    }

    const subGroup = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const requiresElevated =
      subGroup === "settings" || sub === "wake" || sub === "sleep" || sub === "talk" || sub === "hush" ||
      (subGroup === "sessions" && sub === "recap");

    if (requiresElevated && !isElevated(interaction.member as GuildMember | null)) {
      await interaction.reply({ content: "Not authorized.", ephemeral: true });
      return;
    }

    if (subGroup === "settings") {
      await handleSettings(interaction);
      return;
    }

    if (subGroup === "sessions") {
      await handleSessions(interaction, ctx);
      return;
    }

    if (sub === "wake") {
      await handleWake(interaction, ctx);
      return;
    }

    if (sub === "sleep") {
      await handleSleep(interaction);
      return;
    }

    if (sub === "talk") {
      await handleTalk(interaction, ctx);
      return;
    }

    if (sub === "hush") {
      await handleHush(interaction, ctx);
      return;
    }

    if (sub === "status") {
      await handleStatus(interaction, ctx);
      return;
    }

    await interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
  },
};