import { loadRegistryForScope } from "../../registry/loadRegistry.js";

const guildPromptOverrides = new Map<string, string>();

function normalizeName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parsePromptNames(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((item) => normalizeName(item))
    .filter((item) => item.length > 0);
}

export function mergePromptNames(baseNames: string[], extraNames: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const item of [...baseNames, ...extraNames]) {
    const normalized = normalizeName(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }

  return merged;
}

export function buildSttPromptFromNames(baseNames: string[], registryNames: string[]): string | null {
  const merged = mergePromptNames(baseNames, registryNames);
  if (merged.length === 0) return null;
  return merged.join(", ");
}

export function buildSttPromptFromRegistry(args: {
  guildId: string;
  campaignSlug: string;
  fallbackPrompt?: string | null;
}): string | null {
  const fallbackNames = parsePromptNames(args.fallbackPrompt);

  try {
    const registry = loadRegistryForScope({ guildId: args.guildId, campaignSlug: args.campaignSlug });
    const registryNames = registry.characters
      .map((character) => normalizeName(character.canonical_name))
      .filter((name) => name.length > 0);
    return buildSttPromptFromNames(fallbackNames, registryNames);
  } catch {
    if (fallbackNames.length === 0) return null;
    return fallbackNames.join(", ");
  }
}

export function setGuildSttPrompt(guildId: string, prompt: string | null | undefined): void {
  const value = normalizeName(prompt ?? "");
  if (!value) {
    guildPromptOverrides.delete(guildId);
    return;
  }
  guildPromptOverrides.set(guildId, value);
}

export function getGuildSttPrompt(guildId: string | null | undefined): string | undefined {
  if (!guildId) return undefined;
  return guildPromptOverrides.get(guildId);
}

export function clearGuildSttPromptCache(): void {
  guildPromptOverrides.clear();
}
