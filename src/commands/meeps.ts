/**
 * /meeps command group
 * Bookkeeping system for meep balance (player progression tokens)
 * 
 * Subcommands:
 * - spend: Player spends 1 meep from self
 * - reward (DM-only): DM grants 1 meep to target PC
 * - balance: Check self or other PC balance
 * - history: View transaction history for self or other PC
 */

import { SlashCommandBuilder, TextChannel, GuildMember } from 'discord.js';
import { log } from '../utils/logger.js';
import { loadRegistryForScope } from '../registry/loadRegistry.js';
import { getActiveMeepo } from '../meepo/state.js';
import { getDiscordClient } from '../bot.js';
import {
  getMeepBalance,
  getMeepHistory,
  formatMeepReceipt,
  formatMeepHistory,
} from '../meeps/meeps.js';
import { spendMeep, creditMeep, MEEP_MAX_BALANCE } from '../meeps/engine.js';
import { isElevated } from '../security/isElevated.js';
import type { CommandCtx } from './index.js';

const meepsLog = log.withScope("meeps");

/**
 * Resolve a Discord user to a registered PC
 * @returns {canonical_name, discord_user_id} or null if not found
 */
function resolvePcFromUser(
  user: any,
  scope: { guildId: string; campaignSlug: string }
): { canonical_name: string; discord_user_id: string } | null {
  const registry = loadRegistryForScope(scope);
  const pc = registry.byDiscordUserId.get(user.id);
  if (!pc) {
    return null;
  }
  return {
    canonical_name: pc.canonical_name,
    discord_user_id: pc.discord_user_id!,
  };
}

export const meeps = {
  data: new SlashCommandBuilder()
    .setName('meeps')
    .setDescription('Manage meep balance (player progression tokens).')
    .addSubcommand((sub) =>
      sub
        .setName('spend')
        .setDescription('Spend 1 meep (remove from your balance).')
    )
    .addSubcommand((sub) =>
      sub
        .setName('reward')
        .setDescription('[DM-only] Grant 1 meep to a player.')
        .addUserOption((opt) =>
          opt
            .setName('target')
            .setDescription('Player to grant meep to')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('balance')
        .setDescription('Check meep balance (yours or another player).')
        .addUserOption((opt) =>
          opt
            .setName('target')
            .setDescription('Player to check (DM-only to check others)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('history')
        .setDescription('View meep transaction history.')
        .addUserOption((opt) =>
          opt
            .setName('target')
            .setDescription('Player to view history for (DM-only to check others)')
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt
            .setName('limit')
            .setDescription('Number of transactions to show (default 10)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
        )
    ),

  async execute(interaction: any, _ctx: CommandCtx | null) {
    const guildId = interaction.guildId as string;
    const campaignSlug = _ctx?.campaignSlug;
    const sub = interaction.options.getSubcommand();

    if (!campaignSlug) {
      await interaction.reply({ content: 'Meepo scope unavailable for this command.', ephemeral: true });
      return;
    }

    if (sub === 'spend') {
      await handleSpend(interaction, guildId, campaignSlug);
    } else if (sub === 'reward') {
      await handleReward(interaction, guildId, campaignSlug);
    } else if (sub === 'balance') {
      await handleBalance(interaction, guildId, campaignSlug);
    } else if (sub === 'history') {
      await handleHistory(interaction, guildId, campaignSlug);
    }
  },
};

/**
 * /meeps spend
 * Player spends 1 meep from their balance
 */
async function handleSpend(interaction: any, guildId: string, campaignSlug: string): Promise<void> {
  const invoker = interaction.user;
  const invokerPC = resolvePcFromUser(invoker, { guildId, campaignSlug });

  if (!invokerPC) {
    // Not a registered PC - allow any Discord user to have a meep balance
    // (design choice: meeps track per-Discord-ID, not just per-PC)
  }

  meepsLog.debug(`/meeps spend invoked: user=${invoker.username}`);

  // Use engine to spend
  const success = spendMeep({
    guildId,
    campaignSlug,
    invokerDiscordId: invoker.id,
    invokerName: interaction.member?.displayName ?? invoker.username,
  });

  if (!success) {
    await interaction.reply({
      content: 'No meeps... come back once you find some more, meep!',
      ephemeral: true,
    });
    return;
  }

  const newBalance = getMeepBalance({ guildId, campaignSlug }, invoker.id);
  const oldBalance = newBalance + 1;
  meepsLog.info(`Spend: ${invoker.username} spent 1 meep, balance ${oldBalance} → ${newBalance}`);
  const response = formatMeepReceipt(newBalance, 'spend');

  await interaction.reply({
    content: response,
    ephemeral: true,
  });

  // Log transaction to Meepo's bound channel
  try {
    const meepo = getActiveMeepo(guildId);
    if (meepo) {
      const client = getDiscordClient();
      const channel = await client.channels.fetch(meepo.channel_id) as TextChannel;
      if (channel?.isTextBased()) {
        await channel.send(`📋 ${invoker.username} spent 1 meep (balance: ${oldBalance} → ${newBalance})`);
      }
    }
  } catch (err: any) {
    meepsLog.warn(`Failed to log spend to channel: ${err.message ?? err}`);
  }
}

/**
 * /meeps reward
 * DM grants 1 meep to target PC
 */
async function handleReward(interaction: any, guildId: string, campaignSlug: string): Promise<void> {
  // Guard: DM-only
  if (!isElevated(interaction.member as GuildMember | null)) {
    await interaction.reply({
      content: 'Not authorized.',
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser('target');

  // Resolve target to PC
  const targetPC = resolvePcFromUser(target, { guildId, campaignSlug });
  if (!targetPC) {
    await interaction.reply({
      content: `I don't know who that is yet… add them to the registry first, meep.`,
      ephemeral: true,
    });
    return;
  }

  const currentBalance = getMeepBalance({ guildId, campaignSlug }, target.id);

  // Guardrail: Already at cap
  if (currentBalance >= MEEP_MAX_BALANCE) {
    await interaction.reply({
      content: `They're already maxed out (${MEEP_MAX_BALANCE} meeps), meep!`,
      ephemeral: true,
    });
    return;
  }

  // Use engine to credit meep
  const dm = interaction.member;
  const result = creditMeep({
    guildId,
    campaignSlug,
    targetDiscordId: target.id,
    issuerType: 'dm',
    issuerDiscordId: interaction.user.id,
    issuerName: dm?.displayName ?? interaction.user.username,
    sourceType: 'dm',
    sourceRef: `dm:${interaction.user.id}`,
  });

  if (!result.success) {
    await interaction.reply({
      content: `Failed to reward meep (${result.reason}), meep!`,
      ephemeral: true,
    });
    return;
  }

  const newBalance = result.balance!;
  meepsLog.info(`Reward: ${dm?.displayName ?? interaction.user.username} awarded 1 meep to ${targetPC.canonical_name}, balance ${currentBalance} → ${newBalance}`);
  const response = formatMeepReceipt(newBalance, 'reward', targetPC.canonical_name);

  await interaction.reply({
    content: response,
    ephemeral: true,
  });

  // Log transaction to Meepo's bound channel
  try {
    const meepo = getActiveMeepo(guildId);
    if (meepo) {
      const client = getDiscordClient();
      const channel = await client.channels.fetch(meepo.channel_id) as TextChannel;
      if (channel?.isTextBased()) {
        await channel.send(`🎁 ${dm?.displayName ?? interaction.user.username} awarded 1 meep to ${targetPC.canonical_name} (balance: ${currentBalance} → ${newBalance})`);
      }
    }
  } catch (err: any) {
    meepsLog.warn(`Failed to log reward to channel: ${err.message ?? err}`);
  }
}

/**
 * /meeps balance
 * Check meep balance for self or another PC (DM-only for others)
 */
async function handleBalance(interaction: any, guildId: string, campaignSlug: string): Promise<void> {
  const target = interaction.options.getUser('target');
  const invoker = interaction.user;

  // Default to invoker if no target specified
  const checkUser = target ?? invoker;
  const checkPC = resolvePcFromUser(checkUser, { guildId, campaignSlug });
  meepsLog.debug(`/meeps balance invoked: invoker=${invoker.username}, target=${checkUser.username}`);

  // Guard: Non-DM checking someone else's balance
  if (target && !isElevated(interaction.member as GuildMember | null)) {
    await interaction.reply({
      content: 'Not authorized.',
      ephemeral: true,
    });
    return;
  }

  const balance = getMeepBalance({ guildId, campaignSlug }, checkUser.id);
  const maxBalance = 3;

  let response: string;
  if (checkUser.id === invoker.id) {
    response = `You have ${balance}/${maxBalance} meeps.`;
  } else {
    response = `${checkPC?.canonical_name ?? checkUser.username} has ${balance}/${maxBalance} meeps.`;
  }

  await interaction.reply({
    content: response,
    ephemeral: true,
  });
}

/**
 * /meeps history
 * View transaction history for self or another PC (DM-only for others)
 */
async function handleHistory(interaction: any, guildId: string, campaignSlug: string): Promise<void> {
  const target = interaction.options.getUser('target');
  const limit = interaction.options.getInteger('limit') ?? 10;
  const invoker = interaction.user;

  // Default to invoker if no target specified
  const checkUser = target ?? invoker;
  const checkPC = resolvePcFromUser(checkUser, { guildId, campaignSlug });

  // Guard: Non-DM checking someone else's history
  if (target && !isElevated(interaction.member as GuildMember | null)) {
    await interaction.reply({
      content: 'Not authorized.',
      ephemeral: true,
    });
    return;
  }

  const txs = getMeepHistory({ guildId, campaignSlug }, checkUser.id, limit);
  const historyText = formatMeepHistory(txs);

  let title: string;
  if (checkUser.id === invoker.id) {
    title = 'Your meep history:';
  } else {
    title = `${checkPC?.canonical_name ?? checkUser.username}'s meep history:`;
  }

  await interaction.reply({
    content: `${title}\n${historyText}`,
    ephemeral: true,
  });
}
