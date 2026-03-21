import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseDotenv } from "dotenv";
import { REST, Routes } from "discord.js";
import { getEnv } from "../config/rawEnv.js";

const DEFAULT_ENV_FILES = [
  path.resolve(process.cwd(), ".env"),
  process.env.MEEPO_BOT_ENV_FILE?.trim() || "/etc/meepo/meepo-bot.env",
  process.env.MEEPO_WEB_ENV_FILE?.trim() || "/etc/meepo/meepo-web.env",
];

function loadEnvFile(filePath: string): void {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }
  const parsed = parseDotenv(fs.readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    const current = process.env[key];
    if (current !== undefined && current.trim() !== "") {
      continue;
    }
    process.env[key] = value;
  }
}

export function bootstrapDeployEnv(envFiles: string[] = DEFAULT_ENV_FILES): void {
  for (const envFile of envFiles) {
    loadEnvFile(envFile);
  }
}

function resolveApplicationId(): string {
  const appId = getEnv("DISCORD_APPLICATION_ID") ?? getEnv("DISCORD_CLIENT_ID");
  if (!appId) {
    throw new Error("Missing env var: DISCORD_APPLICATION_ID (or DISCORD_CLIENT_ID)");
  }
  return appId;
}

function parseCsvIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getDiscordErrorCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as { code?: unknown }).code;
  return typeof value === "number" ? value : null;
}

export async function main(): Promise<void> {
  bootstrapDeployEnv();

  const { devGuildCommands, globalCommands } = await import("./index.js");
  const token = getEnv("DISCORD_TOKEN");
  if (!token) {
    throw new Error("Missing env var: DISCORD_TOKEN");
  }

  const applicationId = resolveApplicationId();
  const rest = new REST({ version: "10" }).setToken(token);

  const globalBody = globalCommands.map((command) => command.data.toJSON());
  console.log(`Deploying global commands: count=${globalBody.length}`);
  await rest.put(Routes.applicationCommands(applicationId), { body: globalBody });

  const devGuildIds = parseCsvIds(getEnv("DEV_GUILD_IDS"));
  const devGuildBody = devGuildCommands.map((command) => command.data.toJSON());

  if (devGuildIds.length === 0) {
    console.log("DEV_GUILD_IDS empty; skipping /lab deploy");
    console.log("[deploy-commands] deployment complete");
    return;
  }

  console.log(`Deploying dev guild commands: count=${devGuildBody.length} to guilds=[${devGuildIds.join(",")}]`);
  for (const guildId of devGuildIds) {
    try {
      await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: devGuildBody });
    } catch (error) {
      const discordCode = getDiscordErrorCode(error);
      if (discordCode === 50001) {
        console.warn(`[deploy-commands] guild=${guildId}: bot/app not installed in this guild (Discord code 50001) - skipping`);
        continue;
      }
      throw error;
    }
  }

  console.log("[deploy-commands] deployment complete");
}

const entryFile = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";

if (import.meta.url === entryFile) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
