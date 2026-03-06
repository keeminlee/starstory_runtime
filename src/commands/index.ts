import { Collection, type Client } from "discord.js";
import { ping } from "./ping.js";
import { meepo } from "./meepo.js";
import { lab } from "./lab.js";
import { resolveCampaignSlug } from "../campaign/guildConfig.js";
import { getDbForCampaign } from "../db.js";
import { resolveCampaignDbPath } from "../dataPaths.js";
import { getGuildMode } from "../sessions/sessionRuntime.js";
import { logRuntimeContextBanner } from "../runtime/runtimeContextBanner.js";
import { metaMeepoVoice } from "../ui/metaMeepoVoice.js";
import { cfg } from "../config/env.js";
import { log } from "../utils/logger.js";
import {
  getOrCreateTraceId,
  getInteractionId,
  runWithObservabilityContext,
} from "../observability/context.js";
import { formatUserFacingError } from "../errors/formatUserFacingError.js";
import { MeepoError } from "../errors/meepoError.js";

export type CommandCtx = {
  guildId: string;
  guildName?: string;
  campaignSlug: string;
  dbPath: string;
  db: any;
  trace_id?: string;
  interaction_id?: string;
};

const commandLog = log.withScope("command", {
  requireGuildContext: true,
  callsite: "commands/index.ts",
});

export const globalCommands = [ping, meepo];

export const devGuildCommands = [lab];

export const commandList = [ping, meepo, lab];

export const commandMap = new Collection(
  commandList.map((c: any) => [c.data.name, c])
);

function buildCommandCtx(interaction: any): CommandCtx | null {
  const guildId = (interaction.guildId as string | null) ?? null;
  if (!guildId) return null;
  const guildName = (interaction.guild?.name as string | undefined) ?? undefined;
  const campaignSlug = resolveCampaignSlug({ guildId, guildName });
  const dbPath = resolveCampaignDbPath(campaignSlug);
  const db = getDbForCampaign(campaignSlug);
  const interactionId = getInteractionId(interaction);
  return {
    guildId,
    guildName,
    campaignSlug,
    dbPath,
    db,
    trace_id: getOrCreateTraceId(),
    interaction_id: interactionId,
  } satisfies CommandCtx;
}

export function registerHandlers(client: Client) {
  client.on("interactionCreate", async (interaction: any) => {
    try {
      if (
        interaction.isButton?.() ||
        interaction.isStringSelectMenu?.() ||
        interaction.isModalSubmit?.()
      ) {
        const commandCtx = buildCommandCtx(interaction);
        if (typeof (meepo as any).handleComponentInteraction === "function") {
          const handled = await runWithObservabilityContext(
            {
              trace_id: commandCtx?.trace_id,
              interaction_id: commandCtx?.interaction_id,
              guild_id: commandCtx?.guildId,
              campaign_slug: commandCtx?.campaignSlug,
            },
            () => (meepo as any).handleComponentInteraction(interaction, commandCtx)
          );
          if (handled) return;
        }
      }

      if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) return;

      const cmd = commandMap.get(interaction.commandName);
      if (!cmd) {
        if (interaction.isChatInputCommand()) {
          const movedToLabByCommandName: Record<string, string> = {
            goldmem: "/lab goldmem run",
            meeps: "/lab meeps <subcommand>",
            missions: "/lab missions <subcommand>",
          };
          const replacement = movedToLabByCommandName[interaction.commandName as string];
          if (replacement) {
            await interaction.reply({
              content: `Moved: use ${replacement}.`,
              ephemeral: true,
            }).catch(() => {});
          }
        }
        return;
      }

      if (interaction.isAutocomplete()) {
        if (typeof cmd.autocomplete === "function") {
          await cmd.autocomplete(interaction);
        } else {
          await interaction.respond([]).catch(() => {});
        }
        return;
      }

      const guildId = (interaction.guildId as string | null) ?? null;
      const guildName = (interaction.guild?.name as string | undefined) ?? null;
      const mode = guildId ? getGuildMode(guildId) : cfg.mode;

      const commandCtx = guildId ? buildCommandCtx(interaction) : null;

      logRuntimeContextBanner({
        entrypoint: `command:${interaction.commandName}`,
        guildId,
        guildName,
        mode,
        dbPath: commandCtx?.dbPath,
      });

      await runWithObservabilityContext(
        {
          trace_id: commandCtx?.trace_id,
          interaction_id: commandCtx?.interaction_id ?? getInteractionId(interaction),
          guild_id: commandCtx?.guildId ?? guildId ?? undefined,
          campaign_slug: commandCtx?.campaignSlug,
        },
        () => cmd.execute(interaction, commandCtx)
      );
    } catch (err) {
      const commandName = typeof interaction.commandName === "string"
        ? interaction.commandName
        : interaction.customId;
      const payload = formatUserFacingError(err, {
        fallbackMessage: metaMeepoVoice.errors.genericCommandFailure(),
      });
      commandLog.error("Command error", {
        command: commandName,
        error_code: payload.code,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }, {
        interaction_id: getInteractionId(interaction),
        guild_id: (interaction.guildId as string | null) ?? undefined,
      });
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: payload.content, ephemeral: true }).catch((replyErr: unknown) => {
          const wrapped = new MeepoError("ERR_DISCORD_REPLY_FAILED", {
            message: "Failed to send command follow-up response",
            cause: replyErr,
            trace_id: payload.trace_id,
            interaction_id: getInteractionId(interaction),
          });
          commandLog.error("Command follow-up failed", {
            error_code: wrapped.code,
            error: wrapped.message,
            cause: replyErr instanceof Error ? replyErr.message : String(replyErr),
          }, {
            interaction_id: getInteractionId(interaction),
            guild_id: (interaction.guildId as string | null) ?? undefined,
          });
        });
      } else {
        await interaction.reply({ content: payload.content, ephemeral: true }).catch((replyErr: unknown) => {
          const wrapped = new MeepoError("ERR_DISCORD_REPLY_FAILED", {
            message: "Failed to send command reply response",
            cause: replyErr,
            trace_id: payload.trace_id,
            interaction_id: getInteractionId(interaction),
          });
          commandLog.error("Command reply failed", {
            error_code: wrapped.code,
            error: wrapped.message,
            cause: replyErr instanceof Error ? replyErr.message : String(replyErr),
          }, {
            interaction_id: getInteractionId(interaction),
            guild_id: (interaction.guildId as string | null) ?? undefined,
          });
        });
      }
    }
  });
}
