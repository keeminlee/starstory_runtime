import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { getWebCampaignDetail } from "@/lib/server/campaignReaders";
import { WebDataError } from "@/lib/mappers/errorMappers";
import type {
  RegistryCategoryKey,
  RegistryCreateEntryRequest,
  RegistryEntityDto,
  RegistryPendingActionRequest,
  SeenDiscordUserOption,
  RegistryPendingCandidateDto,
  RegistrySnapshotDto,
  RegistryUpdateEntryRequest,
} from "@/lib/registry/types";
import {
  getGuildSeenDiscordUser,
  listGuildSeenDiscordUsers,
} from "../../../../src/campaign/guildSeenDiscordUsers";
import { normKey } from "../../../../src/registry/loadRegistry";
import {
  addAliasIfMissing,
  addIgnoreToken,
  createRegistryEntry,
  removePendingAtIndex,
} from "../../../../src/registry/reviewNamesCore";
import type { Faction, Location, Misc } from "../../../../src/registry/types";
import { ensureRegistryScaffold, getRegistryDirForCampaign, getRegistryDirForScope } from "../../../../src/registry/scaffold";

type QueryInput = Record<string, string | string[] | undefined> | undefined;
type RegistryScope = { campaignSlug: string; guildId: string | null };
export type ResolvedRegistryScope = { campaignSlug: string; guildId: string };

type PendingCandidate = {
  key: string;
  display: string;
  count: number;
  primaryCount: number;
  examples: string[];
};

type PendingDoc = {
  version?: number;
  generated_at?: string;
  source?: {
    campaignSlug?: string;
    guildId?: string | null;
  };
  pending?: PendingCandidate[];
};

type RegistryRoot = {
  version?: number;
  characters?: Array<{
    id: string;
    canonical_name: string;
    aliases?: string[];
    notes?: string;
    discord_user_id?: string;
  }>;
  locations?: Location[];
  factions?: Faction[];
  misc?: Misc[];
};

type RegistryCharacterRow = {
  id: string;
  canonical_name: string;
  aliases?: string[];
  notes?: string;
  discord_user_id?: string;
};

type TolerantRegistryIndex = {
  categories: Record<RegistryCategoryKey, RegistryEntityDto[]>;
  ignoreTokens: string[];
  byName: Map<string, { id: string; category: RegistryCategoryKey }>;
  ids: Set<string>;
};

const CATEGORY_FILE_MAP: Record<RegistryCategoryKey, { file: string; arrayKey: keyof RegistryRoot }> = {
  pcs: { file: "pcs.yml", arrayKey: "characters" },
  npcs: { file: "npcs.yml", arrayKey: "characters" },
  locations: { file: "locations.yml", arrayKey: "locations" },
  factions: { file: "factions.yml", arrayKey: "factions" },
  misc: { file: "misc.yml", arrayKey: "misc" },
};

function getRepoRoot(): string {
  return path.resolve(process.cwd(), "..", "..");
}

function getRegistryBaseDir(): string {
  const dataRoot = process.env.DATA_ROOT?.trim();
  if (dataRoot) {
    return path.join(path.resolve(dataRoot), "registry");
  }

  return path.join(getRepoRoot(), "data", "registry");
}

function toRegistryScope(campaign: { slug: string; guildId: string | null }): RegistryScope {
  return {
    campaignSlug: campaign.slug,
    guildId: campaign.guildId,
  };
}

function toResolvedRegistryScope(args: ResolvedRegistryScope): RegistryScope {
  return {
    campaignSlug: args.campaignSlug,
    guildId: args.guildId,
  };
}

function getRegistryDir(scope: RegistryScope): string {
  if (scope.guildId && scope.guildId.trim().length > 0) {
    const scoped = getRegistryDirForScope({
      guildId: scope.guildId,
      campaignSlug: scope.campaignSlug,
      baseDir: getRegistryBaseDir(),
    });
    const legacy = getRegistryDirForCampaign(scope.campaignSlug, getRegistryBaseDir());
    if (fs.existsSync(scoped) || !fs.existsSync(legacy)) {
      return scoped;
    }
    return legacy;
  }

  return getRegistryDirForCampaign(scope.campaignSlug, getRegistryBaseDir());
}

function getPendingPath(scope: RegistryScope): string {
  return path.join(getRegistryDir(scope), "decisions.pending.yml");
}

function getIgnorePath(scope: RegistryScope): string {
  return path.join(getRegistryDir(scope), "ignore.yml");
}

function getCategoryPath(scope: RegistryScope, category: RegistryCategoryKey): string {
  const mapping = CATEGORY_FILE_MAP[category];
  return path.join(getRegistryDir(scope), mapping.file);
}

function ensureRegistryScopeScaffold(scope: RegistryScope): void {
  ensureRegistryScaffold(getRegistryDir(scope));
}

function parseYamlFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return (yaml.parse(raw) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeYamlFile(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, yaml.stringify(value));
}

function mapCharacter(character: RegistryCharacterRow, category: "pcs" | "npcs"): RegistryEntityDto {
  return {
    id: character.id,
    canonicalName: character.canonical_name,
    aliases: Array.isArray(character.aliases) ? character.aliases : [],
    notes: character.notes ?? "",
    category,
    discordUserId: character.discord_user_id ?? null,
  };
}

function mapLocation(location: Location): RegistryEntityDto {
  return {
    id: location.id,
    canonicalName: location.canonical_name,
    aliases: Array.isArray(location.aliases) ? location.aliases : [],
    notes: location.notes ?? "",
    category: "locations",
    discordUserId: null,
  };
}

function mapFaction(faction: Faction): RegistryEntityDto {
  return {
    id: faction.id,
    canonicalName: faction.canonical_name,
    aliases: Array.isArray(faction.aliases) ? faction.aliases : [],
    notes: faction.notes ?? "",
    category: "factions",
    discordUserId: null,
  };
}

function mapMisc(misc: Misc): RegistryEntityDto {
  return {
    id: misc.id,
    canonicalName: misc.canonical_name,
    aliases: Array.isArray(misc.aliases) ? misc.aliases : [],
    notes: misc.notes ?? "",
    category: "misc",
    discordUserId: null,
  };
}

function normalizeAliases(input: string[] | undefined): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const alias of input) {
    const trimmed = alias.trim();
    if (!trimmed) continue;
    const key = normKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function readIgnoreTokens(scope: RegistryScope): string[] {
  const ignoreDoc = parseYamlFile<{ version?: number; tokens?: string[] }>(getIgnorePath(scope), {
    version: 1,
    tokens: [],
  });

  const tokens = Array.isArray(ignoreDoc.tokens) ? ignoreDoc.tokens : [];
  const normalized = new Set<string>();
  for (const token of tokens) {
    const key = normKey(token);
    if (!key) continue;
    normalized.add(key);
  }
  return Array.from(normalized.values()).sort((a, b) => a.localeCompare(b));
}

function loadRegistryIndex(scope: RegistryScope): TolerantRegistryIndex {
  const pcsDoc = readCategoryDoc(scope, "pcs");
  const npcsDoc = readCategoryDoc(scope, "npcs");
  const locationsDoc = readCategoryDoc(scope, "locations");
  const factionsDoc = readCategoryDoc(scope, "factions");
  const miscDoc = readCategoryDoc(scope, "misc");

  const pcs = (Array.isArray(pcsDoc.characters) ? pcsDoc.characters : []).map((entry) =>
    mapCharacter(entry, "pcs")
  );
  const npcs = (Array.isArray(npcsDoc.characters) ? npcsDoc.characters : []).map((entry) =>
    mapCharacter(entry, "npcs")
  );
  const locations = (Array.isArray(locationsDoc.locations) ? locationsDoc.locations : []).map(mapLocation);
  const factions = (Array.isArray(factionsDoc.factions) ? factionsDoc.factions : []).map(mapFaction);
  const misc = (Array.isArray(miscDoc.misc) ? miscDoc.misc : []).map(mapMisc);

  const categories: Record<RegistryCategoryKey, RegistryEntityDto[]> = {
    pcs,
    npcs,
    locations,
    factions,
    misc,
  };

  const byName = new Map<string, { id: string; category: RegistryCategoryKey }>();
  const ids = new Set<string>();
  for (const [category, entities] of Object.entries(categories) as Array<[RegistryCategoryKey, RegistryEntityDto[]]>) {
    for (const entity of entities) {
      if (entity.id.trim()) {
        ids.add(entity.id);
      }

      const canonicalKey = normKey(entity.canonicalName);
      if (canonicalKey && !byName.has(canonicalKey)) {
        byName.set(canonicalKey, { id: entity.id, category });
      }

      for (const alias of entity.aliases) {
        const aliasKey = normKey(alias);
        if (aliasKey && !byName.has(aliasKey)) {
          byName.set(aliasKey, { id: entity.id, category });
        }
      }
    }
  }

  return {
    categories,
    ignoreTokens: readIgnoreTokens(scope),
    byName,
    ids,
  };
}

async function getAuthorizedCampaign(campaignSlug: string, searchParams?: QueryInput) {
  const campaign = await getWebCampaignDetail({ campaignSlug, searchParams });
  if (!campaign) {
    throw new WebDataError("not_found", 404, `Campaign not found: ${campaignSlug}`);
  }

  return campaign;
}

async function assertAuthorizedCampaign(campaignSlug: string, searchParams?: QueryInput) {
  return getAuthorizedCampaign(campaignSlug, searchParams);
}

async function assertCampaignEditable(campaignSlug: string, searchParams?: QueryInput) {
  const campaign = await getAuthorizedCampaign(campaignSlug, searchParams);
  if (campaign.editable === false || campaign.readOnlyReason === "demo_mode") {
    throw new WebDataError("invalid_request", 422, "This compendium is read-only in system demo mode.");
  }
  if (!campaign.canWrite) {
    throw new WebDataError("unauthorized", 403, "This compendium is read-only because you are not the DM for this campaign.");
  }
  return campaign;
}

function loadRegistrySnapshot(scope: RegistryScope): RegistrySnapshotDto {
  const index = loadRegistryIndex(scope);

  const pendingDoc = parseYamlFile<PendingDoc>(getPendingPath(scope), {});
  const pendingItems: RegistryPendingCandidateDto[] = Array.isArray(pendingDoc.pending)
    ? pendingDoc.pending.map((item) => ({
        key: item.key,
        display: item.display,
        count: item.count,
        primaryCount: item.primaryCount,
        examples: Array.isArray(item.examples) ? item.examples : [],
      }))
    : [];

  return {
    campaignSlug: scope.campaignSlug,
    categories: index.categories,
    ignoreTokens: index.ignoreTokens,
    pending: {
      generatedAt: pendingDoc.generated_at ?? null,
      sourceCampaignSlug: pendingDoc.source?.campaignSlug ?? null,
      sourceGuildId: pendingDoc.source?.guildId ?? null,
      items: pendingItems,
    },
  };
}

function requireGuildScopedCampaign(scope: RegistryScope): string {
  const guildId = scope.guildId?.trim();
  if (!guildId) {
    throw new WebDataError("invalid_request", 422, "This compendium requires an authorized guild scope.");
  }
  return guildId;
}

function toSeenDiscordUserOption(args: {
  discordUserId: string;
  nickname: string;
  username: string | null;
}): SeenDiscordUserOption {
  return {
    discordUserId: args.discordUserId,
    nickname: args.nickname,
    username: args.username,
  };
}

function resolveValidatedPcDiscordUserId(args: {
  guildId: string;
  submittedDiscordUserId?: string | null;
  existingDiscordUserId?: unknown;
}): string {
  const candidate = args.submittedDiscordUserId !== undefined
    ? args.submittedDiscordUserId
    : typeof args.existingDiscordUserId === "string"
      ? args.existingDiscordUserId
      : null;
  const discordUserId = candidate?.trim();
  if (!discordUserId) {
    throw new WebDataError("invalid_request", 422, "Played by is required for PC entries.");
  }

  const seenUser = getGuildSeenDiscordUser({ guildId: args.guildId, discordUserId });
  if (!seenUser) {
    throw new WebDataError("invalid_request", 422, "Selected Discord user is not known for this guild.");
  }

  return discordUserId;
}

function assertNameCollision(
  scope: RegistryScope,
  input: {
    canonicalName: string;
    aliases: string[];
    currentEntityId?: string;
  }
): void {
  const registry = loadRegistryIndex(scope);

  const normalizedNames = [input.canonicalName, ...input.aliases]
    .map((value) => normKey(value))
    .filter((value) => value.length > 0);

  for (const name of normalizedNames) {
    const hit = registry.byName.get(name);
    if (!hit) continue;
    if (input.currentEntityId && hit.id === input.currentEntityId) {
      continue;
    }

    throw new WebDataError("conflict", 409, `Registry name conflict for '${name}'.`);
  }
}

function getEntityList(doc: RegistryRoot, category: RegistryCategoryKey): RegistryRoot["characters"] | Location[] | Faction[] | Misc[] {
  const mapping = CATEGORY_FILE_MAP[category];
  const existing = doc[mapping.arrayKey];
  if (Array.isArray(existing)) {
    return existing as RegistryRoot["characters"] | Location[] | Faction[] | Misc[];
  }

  doc[mapping.arrayKey] = [] as never;
  return doc[mapping.arrayKey] as RegistryRoot["characters"] | Location[] | Faction[] | Misc[];
}

function readCategoryDoc(scope: RegistryScope, category: RegistryCategoryKey): RegistryRoot {
  return parseYamlFile<RegistryRoot>(getCategoryPath(scope, category), { version: 1 });
}

function writeCategoryDoc(scope: RegistryScope, category: RegistryCategoryKey, doc: RegistryRoot): void {
  writeYamlFile(getCategoryPath(scope, category), doc);
}

export async function getWebRegistrySnapshot(args: {
  campaignSlug: string;
  searchParams?: QueryInput;
}): Promise<RegistrySnapshotDto> {
  const campaign = await assertAuthorizedCampaign(args.campaignSlug, args.searchParams);
  return getRegistrySnapshotForResolvedScope({
    campaignSlug: campaign.slug,
    guildId: requireGuildScopedCampaign(toRegistryScope(campaign)),
  });
}

export function getRegistrySnapshotForResolvedScope(args: ResolvedRegistryScope): RegistrySnapshotDto {
  return loadRegistrySnapshot(toResolvedRegistryScope(args));
}

export async function listWebSeenDiscordUsers(args: {
  campaignSlug: string;
  searchParams?: QueryInput;
}): Promise<SeenDiscordUserOption[]> {
  const campaign = await assertAuthorizedCampaign(args.campaignSlug, args.searchParams);
  const scope = toRegistryScope(campaign);
  const guildId = requireGuildScopedCampaign(scope);
  return listGuildSeenDiscordUsers({ guildId }).map((user) =>
    toSeenDiscordUserOption({
      discordUserId: user.discordUserId,
      nickname: user.lastKnownNickname,
      username: user.lastKnownUsername,
    })
  );
}

export async function createWebRegistryEntry(args: {
  campaignSlug: string;
  searchParams?: QueryInput;
  body: RegistryCreateEntryRequest;
}): Promise<RegistrySnapshotDto> {
  const campaign = await assertCampaignEditable(args.campaignSlug, args.searchParams);
  return createRegistryEntryForResolvedScope({
    campaignSlug: campaign.slug,
    guildId: requireGuildScopedCampaign(toRegistryScope(campaign)),
    body: args.body,
  });
}

export function createRegistryEntryForResolvedScope(args: {
  campaignSlug: string;
  guildId: string;
  body: RegistryCreateEntryRequest;
}): RegistrySnapshotDto {
  const scope = toResolvedRegistryScope({ campaignSlug: args.campaignSlug, guildId: args.guildId });
  ensureRegistryScopeScaffold(scope);

  const category = args.body.category;
  const canonicalName = args.body.canonicalName?.trim();
  if (!canonicalName) {
    throw new WebDataError("invalid_request", 422, "canonicalName is required.");
  }

  const aliases = normalizeAliases(args.body.aliases);
  assertNameCollision(scope, { canonicalName, aliases });

  const doc = readCategoryDoc(scope, category);
  const list = getEntityList(doc, category) as Array<Record<string, unknown>>;

  const registry = loadRegistryIndex(scope);
  const existingIds = new Set(registry.ids.values());

  if (category === "pcs" || category === "npcs") {
    const pcDiscordUserId = category === "pcs"
      ? resolveValidatedPcDiscordUserId({ guildId: args.guildId, submittedDiscordUserId: args.body.discordUserId })
      : undefined;
    const created = createRegistryEntry({
      prefix: category === "pcs" ? "pc" : "npc",
      canonicalName,
      candidateDisplay: canonicalName,
      existingIds,
      discordUserId: pcDiscordUserId,
    });

    const entryAliases = normalizeAliases([...(created.aliases ?? []), ...aliases]);
    list.push({
      id: created.id,
      canonical_name: canonicalName,
      aliases: entryAliases,
      notes: args.body.notes?.trim() ?? "",
      ...(category === "pcs" && pcDiscordUserId
        ? { discord_user_id: pcDiscordUserId }
        : {}),
    });
  } else {
    const prefix = category === "locations" ? "loc" : category === "factions" ? "faction" : "misc";
    const created = createRegistryEntry({
      prefix,
      canonicalName,
      candidateDisplay: canonicalName,
      existingIds,
    });
    list.push({
      id: created.id,
      canonical_name: canonicalName,
      aliases,
      notes: args.body.notes?.trim() ?? "",
    });
  }

  writeCategoryDoc(scope, category, doc);
  return loadRegistrySnapshot(scope);
}

export async function addRegistryIgnoreToken(args: {
  campaignSlug: string;
  searchParams?: QueryInput;
  token: string;
}): Promise<{ changed: boolean; registry: RegistrySnapshotDto }> {
  const campaign = await assertCampaignEditable(args.campaignSlug, args.searchParams);
  return addRegistryIgnoreTokenForResolvedScope({
    campaignSlug: campaign.slug,
    guildId: requireGuildScopedCampaign(toRegistryScope(campaign)),
    token: args.token,
  });
}

export function addRegistryIgnoreTokenForResolvedScope(args: {
  campaignSlug: string;
  guildId: string;
  token: string;
}): { changed: boolean; registry: RegistrySnapshotDto } {
  const scope = toResolvedRegistryScope({ campaignSlug: args.campaignSlug, guildId: args.guildId });
  ensureRegistryScopeScaffold(scope);

  const ignorePath = getIgnorePath(scope);
  const ignoreDoc = parseYamlFile<{ version?: number; tokens?: string[] }>(ignorePath, { version: 1, tokens: [] });
  const currentTokens = Array.isArray(ignoreDoc.tokens) ? ignoreDoc.tokens : [];
  const nextTokens = addIgnoreToken(currentTokens, args.token);

  if (nextTokens.changed) {
    ignoreDoc.tokens = nextTokens.tokens;
    writeYamlFile(ignorePath, ignoreDoc);
  }

  return {
    changed: nextTokens.changed,
    registry: loadRegistrySnapshot(scope),
  };
}

export async function updateWebRegistryEntry(args: {
  campaignSlug: string;
  entryId: string;
  searchParams?: QueryInput;
  body: RegistryUpdateEntryRequest;
}): Promise<RegistrySnapshotDto> {
  const campaign = await assertCampaignEditable(args.campaignSlug, args.searchParams);
  return updateRegistryEntryForResolvedScope({
    campaignSlug: campaign.slug,
    guildId: requireGuildScopedCampaign(toRegistryScope(campaign)),
    entryId: args.entryId,
    body: args.body,
  });
}

export function updateRegistryEntryForResolvedScope(args: {
  campaignSlug: string;
  guildId: string;
  entryId: string;
  body: RegistryUpdateEntryRequest;
}): RegistrySnapshotDto {
  const scope = toResolvedRegistryScope({ campaignSlug: args.campaignSlug, guildId: args.guildId });
  ensureRegistryScopeScaffold(scope);

  const category = args.body.category;
  const doc = readCategoryDoc(scope, category);
  const list = getEntityList(doc, category) as Array<Record<string, unknown>>;
  const index = list.findIndex((entry) => String(entry.id) === args.entryId);

  if (index < 0) {
    throw new WebDataError("not_found", 404, `Registry entry not found: ${args.entryId}`);
  }

  const current = list[index];
  const nextCanonicalName = args.body.canonicalName?.trim() || String(current.canonical_name ?? "").trim();
  if (!nextCanonicalName) {
    throw new WebDataError("invalid_request", 422, "canonicalName cannot be empty.");
  }

  const nextAliases = args.body.aliases
    ? normalizeAliases(args.body.aliases)
    : normalizeAliases(Array.isArray(current.aliases) ? (current.aliases as string[]) : []);

  assertNameCollision(scope, {
    canonicalName: nextCanonicalName,
    aliases: nextAliases,
    currentEntityId: args.entryId,
  });

  const updated: Record<string, unknown> = {
    ...current,
    canonical_name: nextCanonicalName,
    aliases: nextAliases,
    notes: args.body.notes !== undefined ? args.body.notes.trim() : String(current.notes ?? ""),
  };

  if (category === "pcs") {
    updated.discord_user_id = resolveValidatedPcDiscordUserId({
      guildId: args.guildId,
      submittedDiscordUserId: args.body.discordUserId,
      existingDiscordUserId: current.discord_user_id,
    });
  } else {
    delete updated.discord_user_id;
  }

  list[index] = updated;
  writeCategoryDoc(scope, category, doc);
  return loadRegistrySnapshot(scope);
}

export async function deleteWebRegistryEntry(args: {
  campaignSlug: string;
  entryId: string;
  category: RegistryCategoryKey;
  searchParams?: QueryInput;
}): Promise<RegistrySnapshotDto> {
  const campaign = await assertCampaignEditable(args.campaignSlug, args.searchParams);
  return deleteRegistryEntryForResolvedScope({
    campaignSlug: campaign.slug,
    guildId: requireGuildScopedCampaign(toRegistryScope(campaign)),
    entryId: args.entryId,
    category: args.category,
  });
}

export function deleteRegistryEntryForResolvedScope(args: {
  campaignSlug: string;
  guildId: string;
  entryId: string;
  category: RegistryCategoryKey;
}): RegistrySnapshotDto {
  const scope = toResolvedRegistryScope({ campaignSlug: args.campaignSlug, guildId: args.guildId });
  ensureRegistryScopeScaffold(scope);

  const doc = readCategoryDoc(scope, args.category);
  const list = getEntityList(doc, args.category) as Array<Record<string, unknown>>;
  const index = list.findIndex((entry) => String(entry.id) === args.entryId);

  if (index < 0) {
    throw new WebDataError("not_found", 404, `Registry entry not found: ${args.entryId}`);
  }

  list.splice(index, 1);
  writeCategoryDoc(scope, args.category, doc);
  return loadRegistrySnapshot(scope);
}

export async function removeAliasFromWebRegistryEntry(args: {
  campaignSlug: string;
  entryId: string;
  category: RegistryCategoryKey;
  aliasText: string;
  searchParams?: QueryInput;
}): Promise<{ changed: boolean; registry: RegistrySnapshotDto }> {
  const campaign = await assertCampaignEditable(args.campaignSlug, args.searchParams);
  return removeAliasFromRegistryEntryForResolvedScope({
    campaignSlug: campaign.slug,
    guildId: requireGuildScopedCampaign(toRegistryScope(campaign)),
    entryId: args.entryId,
    category: args.category,
    aliasText: args.aliasText,
  });
}

export function removeAliasFromRegistryEntryForResolvedScope(args: {
  campaignSlug: string;
  guildId: string;
  entryId: string;
  category: RegistryCategoryKey;
  aliasText: string;
}): { changed: boolean; registry: RegistrySnapshotDto } {
  const scope = toResolvedRegistryScope({ campaignSlug: args.campaignSlug, guildId: args.guildId });
  ensureRegistryScopeScaffold(scope);

  const doc = readCategoryDoc(scope, args.category);
  const list = getEntityList(doc, args.category) as Array<Record<string, unknown>>;
  const index = list.findIndex((entry) => String(entry.id) === args.entryId);

  if (index < 0) {
    throw new WebDataError("not_found", 404, `Registry entry not found: ${args.entryId}`);
  }

  const current = list[index];
  const normalizedAlias = normKey(args.aliasText);
  const currentAliases = Array.isArray(current.aliases) ? (current.aliases as string[]) : [];
  const nextAliases = currentAliases.filter((alias) => normKey(alias) !== normalizedAlias);
  const changed = nextAliases.length !== currentAliases.length;

  if (changed) {
    list[index] = {
      ...current,
      aliases: nextAliases,
    };
    writeCategoryDoc(scope, args.category, doc);
  }

  return {
    changed,
    registry: loadRegistrySnapshot(scope),
  };
}

export async function removeRegistryIgnoreToken(args: {
  campaignSlug: string;
  searchParams?: QueryInput;
  token: string;
}): Promise<{ changed: boolean; registry: RegistrySnapshotDto }> {
  const campaign = await assertCampaignEditable(args.campaignSlug, args.searchParams);
  return removeRegistryIgnoreTokenForResolvedScope({
    campaignSlug: campaign.slug,
    guildId: requireGuildScopedCampaign(toRegistryScope(campaign)),
    token: args.token,
  });
}

export function removeRegistryIgnoreTokenForResolvedScope(args: {
  campaignSlug: string;
  guildId: string;
  token: string;
}): { changed: boolean; registry: RegistrySnapshotDto } {
  const scope = toResolvedRegistryScope({ campaignSlug: args.campaignSlug, guildId: args.guildId });
  ensureRegistryScopeScaffold(scope);

  const ignorePath = getIgnorePath(scope);
  const ignoreDoc = parseYamlFile<{ version?: number; tokens?: string[] }>(ignorePath, { version: 1, tokens: [] });
  const currentTokens = Array.isArray(ignoreDoc.tokens) ? ignoreDoc.tokens : [];
  const normalizedToken = normKey(args.token);
  const nextTokens = currentTokens.filter((token) => normKey(token) !== normalizedToken);
  const changed = nextTokens.length !== currentTokens.length;

  if (changed) {
    ignoreDoc.tokens = nextTokens;
    writeYamlFile(ignorePath, ignoreDoc);
  }

  return {
    changed,
    registry: loadRegistrySnapshot(scope),
  };
}

export async function applyWebRegistryPendingAction(args: {
  campaignSlug: string;
  searchParams?: QueryInput;
  body: RegistryPendingActionRequest;
}): Promise<RegistrySnapshotDto> {
  const campaign = await assertCampaignEditable(args.campaignSlug, args.searchParams);
  const scope = toRegistryScope(campaign);
  const guildId = requireGuildScopedCampaign(scope);
  ensureRegistryScopeScaffold(scope);

  const pendingPath = getPendingPath(scope);
  const pendingDoc = parseYamlFile<PendingDoc>(pendingPath, { version: 1, pending: [] });
  const pending = Array.isArray(pendingDoc.pending) ? [...pendingDoc.pending] : [];
  const index = pending.findIndex((item) => item.key === args.body.key);

  if (index < 0) {
    throw new WebDataError("not_found", 404, `Pending candidate not found: ${args.body.key}`);
  }

  const candidate = pending[index];

  if (args.body.action === "delete") {
    pendingDoc.pending = removePendingAtIndex(pending, index);
    writeYamlFile(pendingPath, pendingDoc);
    return loadRegistrySnapshot(scope);
  }

  if (args.body.action === "reject") {
    const ignorePath = getIgnorePath(scope);
    const ignoreDoc = parseYamlFile<{ version?: number; tokens?: string[] }>(ignorePath, { version: 1, tokens: [] });
    const currentTokens = Array.isArray(ignoreDoc.tokens) ? ignoreDoc.tokens : [];
    const nextTokens = addIgnoreToken(currentTokens, candidate.key);

    if (nextTokens.changed) {
      ignoreDoc.tokens = nextTokens.tokens;
      writeYamlFile(ignorePath, ignoreDoc);
    }

    pendingDoc.pending = removePendingAtIndex(pending, index);
    writeYamlFile(pendingPath, pendingDoc);
    return loadRegistrySnapshot(scope);
  }

  const category = args.body.category;
  const canonicalName = args.body.canonicalName?.trim() || candidate.display;
  const doc = readCategoryDoc(scope, category);
  const list = getEntityList(doc, category) as Array<Record<string, unknown>>;
  const registry = loadRegistryIndex(scope);

  const canonicalKey = normKey(canonicalName);
  const existingByCanonical = registry.byName.get(canonicalKey);

  if (existingByCanonical) {
    const targetIndex = list.findIndex((entry) => String(entry.id) === existingByCanonical.id);
    if (targetIndex < 0) {
      throw new WebDataError("conflict", 409, "Existing canonical target not found in selected category.");
    }

    const existing = list[targetIndex] as {
      id: string;
      canonical_name: string;
      aliases?: string[];
      notes?: string;
      discord_user_id?: string;
    };

    const aliasResult = addAliasIfMissing(
      {
        id: existing.id,
        canonical_name: existing.canonical_name,
        aliases: Array.isArray(existing.aliases) ? existing.aliases : [],
        notes: existing.notes,
        discord_user_id: existing.discord_user_id,
      },
      candidate.display
    );

    list[targetIndex] = {
      ...existing,
      aliases: aliasResult.entry.aliases ?? [],
    };
  } else {
    const existingIds = new Set(registry.ids.values());
    const prefix = category === "pcs" ? "pc" : category === "npcs" ? "npc" : category === "locations" ? "loc" : category === "factions" ? "faction" : "misc";
    const pcDiscordUserId = category === "pcs"
      ? resolveValidatedPcDiscordUserId({ guildId, submittedDiscordUserId: args.body.discordUserId })
      : undefined;
    const created = createRegistryEntry({
      prefix,
      canonicalName,
      candidateDisplay: candidate.display,
      existingIds,
      discordUserId: pcDiscordUserId,
    });

    list.push({
      id: created.id,
      canonical_name: canonicalName,
      aliases: created.aliases ?? [],
      notes: args.body.notes?.trim() ?? "",
      ...(category === "pcs" && pcDiscordUserId
        ? { discord_user_id: pcDiscordUserId }
        : {}),
    });
  }

  writeCategoryDoc(scope, category, doc);
  pendingDoc.pending = removePendingAtIndex(pending, index);
  writeYamlFile(pendingPath, pendingDoc);
  return loadRegistrySnapshot(scope);
}
