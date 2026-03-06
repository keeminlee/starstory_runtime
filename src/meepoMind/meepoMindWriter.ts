import { getGuildMemoryByKey, upsertMemory, type MeepoMindMemory } from "./meepoMindMemoryRepo.js";

export const DM_DISPLAY_NAME_KEY = "dm_display_name";

function normalizeDisplayName(displayName: string): string {
  const normalized = displayName.trim();
  if (!normalized) {
    throw new Error("dm display name must be a non-empty string");
  }
  return normalized;
}

function buildDmDisplayNameText(displayName: string): string {
  return `The Dungeon Master is ${displayName}.`;
}

export function upsertGuildMemory(args: {
  db: any;
  guildId: string;
  key: string;
  text: string;
  tags: string[];
  source: string;
}): MeepoMindMemory {
  return upsertMemory({
    db: args.db,
    scopeKind: "guild",
    scopeId: args.guildId,
    key: args.key,
    text: args.text,
    tags: args.tags,
    source: args.source,
  });
}

export function upsertDmDisplayNameMemory(args: {
  db: any;
  guildId: string;
  displayName: string;
  source: string;
}): MeepoMindMemory {
  const dmDisplayName = normalizeDisplayName(args.displayName);
  return upsertGuildMemory({
    db: args.db,
    guildId: args.guildId,
    key: DM_DISPLAY_NAME_KEY,
    text: buildDmDisplayNameText(dmDisplayName),
    tags: ["identity", "dm"],
    source: args.source,
  });
}

export function hasDmDisplayNameMemory(args: {
  db: any;
  guildId: string;
}): boolean {
  const row = getGuildMemoryByKey({
    db: args.db,
    guildId: args.guildId,
    key: DM_DISPLAY_NAME_KEY,
  });
  return Boolean(row && row.text.trim().length > 0);
}
