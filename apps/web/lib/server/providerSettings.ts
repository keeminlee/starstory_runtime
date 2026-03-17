import type { GuildProviderSettingsModel } from "@/lib/types";
import type { WebAuthContext, WebAuthorizedGuild } from "@/lib/server/authContext";
import { resolveWebAuthContext } from "@/lib/server/authContext";
import { WebDataError } from "@/lib/mappers/errorMappers";
import { assertUserCanWriteGuildArchive } from "@/lib/server/writeAuthority";
import { listWebCampaignsForGuilds } from "@/lib/server/campaignReaders";
import {
  getRequiredCredentialEnvKeyForLlmProvider,
  getRequiredCredentialEnvKeyForSttProvider,
  isLlmProviderConfigured,
  isSttProviderConfigured,
  resolveRuntimeLlmProvider,
  resolveRuntimeSttProvider,
} from "../../../../src/config/providerSelection.js";
import { getGuildLlmProvider, getGuildSttProvider, setGuildLlmProvider, setGuildSttProvider } from "../../../../src/campaign/guildConfig.js";
import type { GuildSttProvider, LlmProvider } from "../../../../src/config/types.js";

type QueryInput = Record<string, string | string[] | undefined> | undefined;

function readQueryGuildId(searchParams?: QueryInput): string | null {
  const fromGuildId = searchParams?.guild_id ?? searchParams?.guildId;
  const value = Array.isArray(fromGuildId) ? fromGuildId[0] : fromGuildId;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toGuildOption(guild: WebAuthorizedGuild): GuildProviderSettingsModel["guildOptions"][number] {
  return {
    guildId: guild.id,
    guildName: guild.name ?? guild.id,
    guildIconUrl: guild.iconUrl ?? null,
    canWrite: true,
  };
}

export function resolveSelectedWritableGuild(args: {
  requestedGuildId?: string | null;
  writableGuilds: WebAuthorizedGuild[];
}): WebAuthorizedGuild {
  if (args.writableGuilds.length === 0) {
    throw new WebDataError(
      "unauthorized",
      403,
      "Guild settings are available only for guild archives where you have DM access in the dashboard."
    );
  }

  const requestedGuildId = args.requestedGuildId?.trim() || null;
  if (requestedGuildId) {
    const selected = args.writableGuilds.find((guild) => guild.id === requestedGuildId);
    if (!selected) {
      throw new WebDataError("not_found", 404, `Guild settings are not available for guild ${requestedGuildId}.`);
    }
    return selected;
  }

  return args.writableGuilds[0]!;
}

async function listWritableSettingsGuilds(auth: WebAuthContext): Promise<WebAuthorizedGuild[]> {
  const model = await listWebCampaignsForGuilds({
    authorizedGuildIds: auth.authorizedGuildIds,
    authorizedGuilds: auth.authorizedGuilds,
    authorizedUserId: auth.user?.id ?? null,
    includeDemoFallback: false,
  });

  const seen = new Set<string>();
  const writableGuilds: WebAuthorizedGuild[] = [];
  for (const campaign of model.campaigns) {
    const guildId = campaign.guildId?.trim();
    if (!guildId || !campaign.canWrite || seen.has(guildId)) {
      continue;
    }
    seen.add(guildId);
    writableGuilds.push({
      id: guildId,
      name: campaign.guildName,
      iconUrl: campaign.guildIconUrl ?? undefined,
    });
  }

  return writableGuilds;
}

export async function buildGuildProviderSettingsModel(args: {
  auth: WebAuthContext;
  requestedGuildId?: string | null;
}): Promise<GuildProviderSettingsModel> {
  const writableGuilds = await listWritableSettingsGuilds(args.auth);
  const selectedGuild = resolveSelectedWritableGuild({
    requestedGuildId: args.requestedGuildId,
    writableGuilds,
  });

  const sttProvider = getGuildSttProvider(selectedGuild.id);
  const llmProvider = getGuildLlmProvider(selectedGuild.id);
  const effectiveSttProvider = resolveRuntimeSttProvider(selectedGuild.id);
  const effectiveLlmProvider = resolveRuntimeLlmProvider(selectedGuild.id);

  return {
    selectedGuildId: selectedGuild.id,
    selectedGuildName: selectedGuild.name ?? selectedGuild.id,
    selectedGuildIconUrl: selectedGuild.iconUrl ?? null,
    canWriteSelectedGuild: true,
    guildOptions: writableGuilds.map(toGuildOption),
    sttProvider,
    llmProvider,
    effectiveSttProvider,
    effectiveLlmProvider,
    sttCredentialConfigured: isSttProviderConfigured(effectiveSttProvider),
    llmCredentialConfigured: isLlmProviderConfigured(effectiveLlmProvider),
    sttCredentialEnvKey: getRequiredCredentialEnvKeyForSttProvider(effectiveSttProvider),
    llmCredentialEnvKey: getRequiredCredentialEnvKeyForLlmProvider(effectiveLlmProvider),
  };
}

export async function getGuildProviderSettingsModel(searchParams?: QueryInput): Promise<GuildProviderSettingsModel> {
  const auth = await resolveWebAuthContext(searchParams);
  return await buildGuildProviderSettingsModel({
    auth,
    requestedGuildId: readQueryGuildId(searchParams),
  });
}

export async function updateGuildProviderSettings(args: {
  guildId: string;
  sttProvider?: GuildSttProvider;
  llmProvider?: LlmProvider;
  searchParams?: QueryInput;
}): Promise<GuildProviderSettingsModel> {
  const auth = await resolveWebAuthContext(args.searchParams);
  const guildId = args.guildId.trim();

  if (!auth.authorizedGuildIds.includes(guildId)) {
    throw new WebDataError("not_found", 404, `Guild ${guildId} is not authorized for this session.`);
  }

  assertUserCanWriteGuildArchive({ guildId, userId: auth.user?.id ?? null });

  if (args.sttProvider !== undefined) {
    setGuildSttProvider(guildId, args.sttProvider);
  }
  if (args.llmProvider !== undefined) {
    setGuildLlmProvider(guildId, args.llmProvider);
  }

  return await buildGuildProviderSettingsModel({
    auth,
    requestedGuildId: guildId,
  });
}