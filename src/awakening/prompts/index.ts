import type { GuildOnboardingState } from "../../ledger/awakeningStateRepo.js";
import type { AwakenScript } from "../../scripts/awakening/_schema.js";
import type { PendingPromptState } from "../wakeIdentity.js";
import {
  AWAKEN_CONTINUE_KEY,
  buildContinuePromptPayload,
  parseContinueCustomId,
} from "./continuePrompt.js";
import {
  buildChoicePromptPayload,
  parseChoicePromptCustomId,
  resolveChoicePromptValue,
} from "./choicePrompt.js";
import {
  buildChannelSelectPromptPayload,
  getChannelSelectFilter,
  parseChannelSelectCustomId,
} from "./channelSelectPrompt.js";
import {
  buildModalTextPromptPayload,
  parseModalOpenCustomId,
  parseModalSubmitCustomId,
} from "./modalTextPrompt.js";
import {
  buildRegistryBuilderPromptPayload,
  buildRegistryUserSelectPayload,
  parseRegistryAddCustomId,
  parseRegistryDoneCustomId,
  parseRegistryNameModalCustomId,
  parseRegistryUserSelectCustomId,
} from "./registryBuilderPrompt.js";
import {
  buildRoleSelectPromptPayload,
  parseRoleSelectPromptCustomId,
} from "./roleSelectPrompt.js";

type ReplyLike = {
  replied?: boolean;
  deferred?: boolean;
  reply: (payload: unknown) => Promise<unknown>;
  editReply: (payload: unknown) => Promise<unknown>;
  followUp?: (payload: unknown) => Promise<unknown>;
};

export async function renderPendingAwakeningPrompt(args: {
  interaction: ReplyLike;
  script: AwakenScript;
  state: GuildOnboardingState;
  pending: PendingPromptState;
}): Promise<boolean> {
  const scene = args.script.scenes[args.pending.sceneId];
  if (!scene) return false;
  if (args.pending.kind === "continue") {
    if (args.pending.key !== AWAKEN_CONTINUE_KEY) return false;

    const payload = buildContinuePromptPayload({
      guildId: args.state.guild_id,
      onboardingId: args.state.script_id,
      sceneId: args.pending.sceneId,
      nonce: args.pending.nonce,
    });

    if (typeof args.interaction.followUp === "function") {
      await args.interaction.followUp(payload);
      return true;
    }

    if (args.interaction.deferred || args.interaction.replied) {
      await args.interaction.editReply(payload);
    } else {
      await args.interaction.reply(payload);
    }
    return true;
  }

  const prompt = scene.prompt;
  if (!prompt || prompt.key !== args.pending.key) return false;

  if (args.pending.kind === "choice") {
    if (prompt.type !== "choice") return false;

    const payload = buildChoicePromptPayload({
      prompt,
      sceneId: args.pending.sceneId,
      key: args.pending.key,
      nonce: args.pending.nonce,
    });

    if (args.interaction.deferred || args.interaction.replied) {
      await args.interaction.editReply(payload);
    } else {
      await args.interaction.reply(payload);
    }
    return true;
  }

  if (args.pending.kind === "role_select") {
    if (prompt.type !== "role_select") return false;
    const guildRoles = Array.from((args.interaction as any).guild?.roles?.cache?.values?.() ?? [])
      .filter((role: any) => role?.id && role?.name)
      .map((role: any) => ({ id: String(role.id), name: String(role.name) }))
      .filter((role: { id: string; name: string }) => role.name !== "@everyone")
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

    const payload = buildRoleSelectPromptPayload({
      prompt,
      sceneId: args.pending.sceneId,
      key: args.pending.key,
      nonce: args.pending.nonce,
      roles: guildRoles,
    });

    if (args.interaction.deferred || args.interaction.replied) {
      await args.interaction.editReply(payload);
    } else {
      await args.interaction.reply(payload);
    }
    return true;
  }

  if (args.pending.kind === "modal_text") {
    if (prompt.type !== "modal_text") return false;

    const payload = buildModalTextPromptPayload({
      prompt,
      sceneId: args.pending.sceneId,
      key: args.pending.key,
      nonce: args.pending.nonce,
    });

    if (args.interaction.deferred || args.interaction.replied) {
      await args.interaction.editReply(payload);
    } else {
      await args.interaction.reply(payload);
    }
    return true;
  }

  if (args.pending.kind === "channel_select") {
    if (prompt.type !== "channel_select") return false;
    const channels = Array.from((args.interaction as any).guild?.channels?.cache?.values?.() ?? [])
      .filter((channel: any) => {
        if (!channel?.id || !channel?.name) return false;
        const filter = getChannelSelectFilter(prompt);
        if (filter === "voice") return Boolean(channel.isVoiceBased?.());
        return Boolean(channel.isTextBased?.()) && !channel.isVoiceBased?.();
      })
      .map((channel: any) => ({ id: String(channel.id), name: String(channel.name) }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

    const pendingValue = typeof args.state.progress_json[args.pending.key] === "string"
      ? String(args.state.progress_json[args.pending.key])
      : null;

    const payload = buildChannelSelectPromptPayload({
      prompt,
      sceneId: args.pending.sceneId,
      key: args.pending.key,
      nonce: args.pending.nonce,
      channels,
      currentChannelName: String((args.interaction as any).channel?.name ?? ""),
      pendingValue,
    });

    if (args.interaction.deferred || args.interaction.replied) {
      await args.interaction.editReply(payload);
    } else {
      await args.interaction.reply(payload);
    }
    return true;
  }

  if (args.pending.kind === "registry_builder") {
    if (prompt.type !== "registry_builder") return false;
    const players = Array.isArray(args.state.progress_json[args.pending.key])
      ? (args.state.progress_json[args.pending.key] as unknown[])
      : [];
    const pendingCharacterNameRaw = args.state.progress_json._rb_pending_character_name;
    const pendingCharacterName = typeof pendingCharacterNameRaw === "string"
      ? pendingCharacterNameRaw.trim()
      : "";

    if (pendingCharacterName.length > 0) {
      const members = Array.from((args.interaction as any).guild?.members?.cache?.values?.() ?? [])
        .filter((member: any) => member?.id)
        .map((member: any) => ({
          id: String(member.id),
          label: String(member.displayName ?? member.user?.username ?? member.id),
        }))
        .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label));

      const payload = buildRegistryUserSelectPayload({
        sceneId: args.pending.sceneId,
        key: args.pending.key,
        nonce: args.pending.nonce,
        characterName: pendingCharacterName,
        members,
      });

      if (args.interaction.deferred || args.interaction.replied) {
        await args.interaction.editReply(payload);
      } else {
        await args.interaction.reply(payload);
      }
      return true;
    }

    const payload = buildRegistryBuilderPromptPayload({
      prompt,
      sceneId: args.pending.sceneId,
      key: args.pending.key,
      nonce: args.pending.nonce,
      playersCount: players.length,
    });

    if (args.interaction.deferred || args.interaction.replied) {
      await args.interaction.editReply(payload);
    } else {
      await args.interaction.reply(payload);
    }
    return true;
  }

  return false;
}

export {
  parseContinueCustomId,
  parseChannelSelectCustomId,
  parseChoicePromptCustomId,
  parseModalOpenCustomId,
  parseModalSubmitCustomId,
  parseRegistryAddCustomId,
  parseRegistryDoneCustomId,
  parseRegistryNameModalCustomId,
  parseRegistryUserSelectCustomId,
  parseRoleSelectPromptCustomId,
  resolveChoicePromptValue,
};
