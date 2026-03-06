import type { Character } from "../types.js";
import { normKey } from "../loadRegistry.js";

function toSnakeCase(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function allocatePcId(canonicalName: string, existingIds: ReadonlySet<string>): string {
  const normalized = normKey(canonicalName);
  const baseToken = toSnakeCase(normalized || canonicalName);
  const baseId = `pc_${baseToken || "player"}`;

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let index = 2;
  while (existingIds.has(`${baseId}_${index}`)) {
    index += 1;
  }

  return `${baseId}_${index}`;
}

export function buildPcRegistryEntry(args: {
  canonical_name: string;
  discord_user_id: string;
  existingIds: ReadonlySet<string>;
}): Character {
  const canonicalName = args.canonical_name.trim();
  const discordUserId = args.discord_user_id.trim();

  if (!canonicalName) {
    throw new Error("canonical_name must be non-empty");
  }

  if (!discordUserId) {
    throw new Error("discord_user_id must be non-empty");
  }

  return {
    id: allocatePcId(canonicalName, args.existingIds),
    canonical_name: canonicalName,
    type: "pc",
    discord_user_id: discordUserId,
    aliases: [],
    notes: "",
  };
}
