import {
  ApplicationCommandOptionType,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from "discord.js";
// NOTE(v1.1): meepoLegacy is intentionally excluded from voice-string centralization.
// This lab-only surface is deferred and may retain inline prose until a dedicated legacy pass.
import { meepo as meepoLegacy } from "./meepoLegacy.js";
import { session } from "./session.js";
import { meeps } from "./meeps.js";
import { missions } from "./missions.js";
import { goldmem } from "./goldmem.js";
import { cfg } from "../config/env.js";
import type { CommandCtx } from "./index.js";

type LegacyCommand = {
  data: { toJSON(): any };
  execute: (interaction: any, ctx: CommandCtx | null) => Promise<void>;
};

const familyCommands: Record<string, LegacyCommand> = {
  meepo: meepoLegacy,
  session,
  meeps,
  missions,
  goldmem,
};

type Route = {
  exposedSubcommand: string;
  targetSubcommand: string;
  targetSubcommandGroup: string | null;
  sourceOption: any;
};

function applyPrimitiveOption(sub: SlashCommandSubcommandBuilder, option: any): void {
  if (option.type === ApplicationCommandOptionType.String) {
    sub.addStringOption((opt) => {
      opt.setName(option.name).setDescription(option.description ?? "").setRequired(Boolean(option.required));
      if (Array.isArray(option.choices) && option.choices.length > 0) {
        opt.addChoices(...option.choices.map((choice: any) => ({ name: choice.name, value: choice.value })));
      }
      if (option.autocomplete) {
        opt.setAutocomplete(true);
      }
      return opt;
    });
    return;
  }

  if (option.type === ApplicationCommandOptionType.Integer) {
    sub.addIntegerOption((opt) => {
      opt.setName(option.name).setDescription(option.description ?? "").setRequired(Boolean(option.required));
      if (typeof option.min_value === "number") opt.setMinValue(option.min_value);
      if (typeof option.max_value === "number") opt.setMaxValue(option.max_value);
      if (Array.isArray(option.choices) && option.choices.length > 0) {
        opt.addChoices(...option.choices.map((choice: any) => ({ name: choice.name, value: choice.value })));
      }
      return opt;
    });
    return;
  }

  if (option.type === ApplicationCommandOptionType.Boolean) {
    sub.addBooleanOption((opt) =>
      opt.setName(option.name).setDescription(option.description ?? "").setRequired(Boolean(option.required))
    );
    return;
  }

  if (option.type === ApplicationCommandOptionType.User) {
    sub.addUserOption((opt) =>
      opt.setName(option.name).setDescription(option.description ?? "").setRequired(Boolean(option.required))
    );
    return;
  }

  if (option.type === ApplicationCommandOptionType.Channel) {
    sub.addChannelOption((opt) => {
      opt.setName(option.name).setDescription(option.description ?? "").setRequired(Boolean(option.required));
      if (Array.isArray(option.channel_types) && option.channel_types.length > 0) {
        opt.addChannelTypes(...option.channel_types);
      }
      return opt;
    });
    return;
  }

  if (option.type === ApplicationCommandOptionType.Number) {
    sub.addNumberOption((opt) => {
      opt.setName(option.name).setDescription(option.description ?? "").setRequired(Boolean(option.required));
      if (typeof option.min_value === "number") opt.setMinValue(option.min_value);
      if (typeof option.max_value === "number") opt.setMaxValue(option.max_value);
      return opt;
    });
    return;
  }

  if (option.type === ApplicationCommandOptionType.Role) {
    sub.addRoleOption((opt) =>
      opt.setName(option.name).setDescription(option.description ?? "").setRequired(Boolean(option.required))
    );
    return;
  }

  if (option.type === ApplicationCommandOptionType.Mentionable) {
    sub.addMentionableOption((opt) =>
      opt.setName(option.name).setDescription(option.description ?? "").setRequired(Boolean(option.required))
    );
    return;
  }

  if (option.type === ApplicationCommandOptionType.Attachment) {
    sub.addAttachmentOption((opt) =>
      opt.setName(option.name).setDescription(option.description ?? "").setRequired(Boolean(option.required))
    );
  }
}

function cloneSubcommand(targetName: string, sourceSubcommand: any): SlashCommandSubcommandBuilder {
  const sub = new SlashCommandSubcommandBuilder()
    .setName(targetName)
    .setDescription(sourceSubcommand.description ?? "");

  const optionList = Array.isArray(sourceSubcommand.options) ? sourceSubcommand.options : [];
  for (const option of optionList) {
    applyPrimitiveOption(sub, option);
  }

  return sub;
}

function buildRoutesFromCommand(command: LegacyCommand): Route[] {
  const json = command.data.toJSON();
  const options = Array.isArray(json.options) ? json.options : [];

  const hasSubcommands = options.some(
    (option: any) =>
      option.type === ApplicationCommandOptionType.Subcommand ||
      option.type === ApplicationCommandOptionType.SubcommandGroup
  );

  if (!hasSubcommands) {
    return [
      {
        exposedSubcommand: "run",
        targetSubcommand: "run",
        targetSubcommandGroup: null,
        sourceOption: {
          name: "run",
          description: json.description ?? "Run command",
          options,
        },
      },
    ];
  }

  const routes: Route[] = [];
  for (const option of options) {
    if (option.type === ApplicationCommandOptionType.Subcommand) {
      routes.push({
        exposedSubcommand: option.name,
        targetSubcommand: option.name,
        targetSubcommandGroup: null,
        sourceOption: option,
      });
      continue;
    }

    if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
      for (const sub of option.options ?? []) {
        routes.push({
          exposedSubcommand: `${option.name}-${sub.name}`,
          targetSubcommand: sub.name,
          targetSubcommandGroup: option.name,
          sourceOption: sub,
        });
      }
    }
  }

  return routes;
}

const routesByFamily: Record<string, Route[]> = Object.fromEntries(
  Object.entries(familyCommands).map(([family, command]) => [family, buildRoutesFromCommand(command)])
);

function buildLabData(): SlashCommandBuilder {
  const root = new SlashCommandBuilder().setName("lab").setDescription("Legacy command quarantine namespace.");

  for (const [family, command] of Object.entries(familyCommands)) {
    const sourceDescription = command.data.toJSON().description ?? `Legacy /${family}`;
    const routes = routesByFamily[family] ?? [];

    root.addSubcommandGroup((group) => {
      group.setName(family).setDescription(`Legacy /${family}: ${sourceDescription}`);
      for (const route of routes) {
        group.addSubcommand(cloneSubcommand(route.exposedSubcommand, route.sourceOption));
      }
      return group;
    });
  }

  return root;
}

function createRoutedInteraction(interaction: any, route: Route): any {
  const baseOptions = interaction.options;
  const routedInteraction = Object.create(interaction);
  routedInteraction.options = Object.create(baseOptions);
  routedInteraction.options.getSubcommandGroup = (required?: boolean) => {
    if (route.targetSubcommandGroup) {
      return route.targetSubcommandGroup;
    }
    if (required) {
      throw new Error("Expected subcommand group");
    }
    return null;
  };
  routedInteraction.options.getSubcommand = () => route.targetSubcommand;
  routedInteraction.options.getString = (name: string, required?: boolean) =>
    baseOptions.getString(name, required);
  routedInteraction.options.getInteger = (name: string, required?: boolean) =>
    baseOptions.getInteger(name, required);
  routedInteraction.options.getBoolean = (name: string, required?: boolean) =>
    baseOptions.getBoolean(name, required);
  routedInteraction.options.getUser = (name: string, required?: boolean) =>
    baseOptions.getUser(name, required);
  routedInteraction.options.getChannel = (name: string, required?: boolean) =>
    baseOptions.getChannel(name, required);
  routedInteraction.options.getRole = (name: string, required?: boolean) =>
    baseOptions.getRole(name, required);
  routedInteraction.options.getMentionable = (name: string, required?: boolean) =>
    baseOptions.getMentionable(name, required);
  routedInteraction.options.getNumber = (name: string, required?: boolean) =>
    baseOptions.getNumber(name, required);
  routedInteraction.options.getAttachment = (name: string, required?: boolean) =>
    baseOptions.getAttachment(name, required);
  return routedInteraction;
}

export const lab = {
  data: buildLabData(),

  async execute(interaction: any, ctx: CommandCtx | null) {
    const userId = interaction.user?.id as string | undefined;
    const guildId = interaction.guildId as string | null;
    const allowByUser = Boolean(userId && cfg.access.devUserIds.includes(userId));
    const allowByGuild = Boolean(guildId && cfg.access.devGuildIds.includes(guildId));

    if (!allowByUser && !allowByGuild) {
      await interaction.reply({
        content: "Not authorized. /lab is restricted to development allowlists.",
        ephemeral: true,
      });
      return;
    }

    const family = interaction.options.getSubcommandGroup(true);
    const exposedSubcommand = interaction.options.getSubcommand(true);

    const command = familyCommands[family];
    if (!command) {
      await interaction.reply({ content: `Unknown /lab family: ${family}`, ephemeral: true });
      return;
    }

    const route = (routesByFamily[family] ?? []).find((item) => item.exposedSubcommand === exposedSubcommand);
    if (!route) {
      await interaction.reply({ content: `Unknown /lab ${family} command: ${exposedSubcommand}`, ephemeral: true });
      return;
    }

    const routedInteraction = createRoutedInteraction(interaction, route);
    await command.execute(routedInteraction, ctx);
  },
};
