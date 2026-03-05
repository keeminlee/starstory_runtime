import { Collection, type Client } from "discord.js";
import { ping } from "./ping.js";
import { meepo } from "./meepo.js";
import { lab } from "./lab.js";
import { meeps } from "./meeps.js";
import { missions } from "./missions.js";
import { goldmem } from "./goldmem.js";
import { cfg } from "../config/env.js";
import { resolveCampaignSlug } from "../campaign/guildConfig.js";
import { getDbForCampaign } from "../db.js";
import { resolveCampaignDbPath } from "../dataPaths.js";
import { getGuildMode } from "../sessions/sessionRuntime.js";
import { logRuntimeContextBanner } from "../runtime/runtimeContextBanner.js";
import { metaMeepoVoice } from "../ui/metaMeepoVoice.js";

export type CommandCtx = {
  guildId: string;
  guildName?: string;
  campaignSlug: string;
  dbPath: string;
  db: any;
};

export const commandList = cfg.features.labCommandsEnabled
  ? [ping, meepo, lab, meeps, missions, goldmem]
  : [ping, meepo, meeps, missions, goldmem];

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
  return {
    guildId,
    guildName,
    campaignSlug,
    dbPath,
    db,
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
          const handled = await (meepo as any).handleComponentInteraction(interaction, commandCtx);
          if (handled) return;
        }
      }

      if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) return;

      const cmd = commandMap.get(interaction.commandName);
      if (!cmd) return;

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

      await cmd.execute(interaction, commandCtx);
    } catch (err) {
      const commandName = typeof interaction.commandName === "string"
        ? interaction.commandName
        : interaction.customId;
      console.error("Command error", commandName, err);
      const msg = metaMeepoVoice.errors.genericCommandFailure();
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
    }
  });
}
