import { resolveWebAuthContext, type WebAuthorizedGuild } from "@/lib/server/authContext";
import { WebAuthError } from "@/lib/server/authContext";
import { mapCanonicalSessionOrigin } from "@/lib/mappers/sessionMappers";
import { prettifyCampaignSlug, formatSessionDisplayTitle } from "@/lib/campaigns/display";
import {
  countArchivedSessionsForGuildCampaign,
  getGuildConfigState,
  getGuildCampaignDisplayName,
  isCampaignSlugOwnedByGuild,
  listBornStarsForGuildCampaign,
  listKnownGuildIds,
  listScopedCampaignDirectoryRecords,
  listGuildCampaignRecords,
  listSessionsForGuildCampaign,
  readSessionRecap,
  readSessionTranscript,
} from "@/lib/server/readData/archiveReadStore";
import { getDemoCampaignSummary } from "@/lib/server/demoCampaign";
import { getGuildDisplayMetadataByIds } from "@/lib/server/discordGuildMetadataStore";
import { ScopeGuardError } from "@/lib/server/scopeGuards";
import { WebDataError } from "@/lib/mappers/errorMappers";
import { assertUserCanWriteCampaignArchive, canUserWriteCampaignArchive } from "@/lib/server/writeAuthority";
import { repairMissingBornStarsForCampaignScope } from "../../../../src/sessions/starBirth.js";
import type {
  CampaignSummary,
  DashboardEmptyGuild,
  DashboardModel,
  HomepageSkyCampaignSummary,
  HomepageSkyBornStarSummary,
  HomepageSkyDiagnostics,
  HomepageSkyProjection,
  HomepageSkySkippedCampaign,
  SessionArtifactStatus,
  SessionSummary,
} from "@/lib/types";

const HOMEPAGE_SKY_DIAGNOSTICS_ENABLED =
  process.env.NODE_ENV !== "production"
  && /^(1|true|yes|on)$/i.test(process.env.STARSTORY_HOMEPAGE_DIAGNOSTICS?.trim() ?? "");

function logHomepageSkyDiagnostics(event: string, context: Record<string, unknown>): void {
  if (!HOMEPAGE_SKY_DIAGNOSTICS_ENABLED) {
    return;
  }

  console.info(`[homepage-sky] ${event}`, context);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

type QueryInput = Record<string, string | string[] | undefined> | undefined;

function readIncludeArchived(searchParams?: QueryInput): boolean {
  const raw = searchParams?.show_archived ?? searchParams?.include_archived;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function toIsoDateTime(ms: number): string {
  return new Date(ms).toISOString();
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function buildArtifactStatus(args: {
  hasData: boolean;
  unavailable: boolean;
}): SessionArtifactStatus {
  if (args.hasData) return "available";
  return args.unavailable ? "unavailable" : "missing";
}

type SessionSummaryWithStats = {
  session: SessionSummary;
  wordCount: number;
};

function resolveGuildDisplayName(args: { guildId: string; guildName?: string }): string {
  const guildId = args.guildId.trim();
  if (!guildId) return "unknown-guild";
  const trimmed = args.guildName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : guildId;
}

function resolveGuildIconUrl(guildIconUrl?: string): string | null {
  const trimmed = guildIconUrl?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function buildCampaignDescription(guildDisplayName: string): string {
  return `Canonical archive stream for ${guildDisplayName}.`;
}

function normalizeGuildId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function readGuildIdDisambiguator(searchParams?: QueryInput): string | null {
  const raw = searchParams?.guild_id ?? searchParams?.guildId;
  if (Array.isArray(raw)) {
    return normalizeGuildId(raw[0] ?? null);
  }
  return normalizeGuildId(typeof raw === "string" ? raw : null);
}

function readGuildNameById(auth: Awaited<ReturnType<typeof resolveWebAuthContext>>, guildId: string): string | undefined {
  return auth.authorizedGuilds.find((guild) => guild.id === guildId)?.name;
}

function readGuildIconById(auth: Awaited<ReturnType<typeof resolveWebAuthContext>>, guildId: string): string | undefined {
  return auth.authorizedGuilds.find((guild) => guild.id === guildId)?.iconUrl;
}

function guildHasVisibleCampaignSlug(args: { guildId: string; campaignSlug: string }): boolean {
  if (isCampaignSlugOwnedByGuild(args)) {
    return true;
  }

  return listSessionsForGuildCampaign({
    guildId: args.guildId,
    campaignSlug: args.campaignSlug,
    limit: 1,
    includeArchived: false,
  }).length > 0;
}

function guildHasVisibleCampaignSlugForMode(args: {
  guildId: string;
  campaignSlug: string;
  includeArchived: boolean;
}): boolean {
  const hasVisibleSessions = listSessionsForGuildCampaign({
    guildId: args.guildId,
    campaignSlug: args.campaignSlug,
    limit: 1,
    includeArchived: false,
  }).length > 0;

  if (args.includeArchived) {
    return isCampaignSlugOwnedByGuild(args) || listSessionsForGuildCampaign({
      guildId: args.guildId,
      campaignSlug: args.campaignSlug,
      limit: 1,
      includeArchived: true,
    }).length > 0;
  }

  if (hasVisibleSessions) {
    return true;
  }

  if (isCampaignSlugOwnedByGuild(args)) {
    return listSessionsForGuildCampaign({
      guildId: args.guildId,
      campaignSlug: args.campaignSlug,
      limit: 1,
      includeArchived: true,
    }).length === 0;
  }

  return false;
}

function resolveGuildScopeForSlug(args: {
  auth: Awaited<ReturnType<typeof resolveWebAuthContext>>;
  campaignSlug: string;
  searchParams?: QueryInput;
  includeArchived?: boolean;
}): { guildId: string; guildName?: string; guildIconUrl?: string } | null {
  const requestedGuildId = readGuildIdDisambiguator(args.searchParams);
  const campaignSlug = args.campaignSlug.trim();
  if (!campaignSlug) {
    throw new ScopeGuardError("Campaign is out of scope for the authorized guild set.");
  }

  if (requestedGuildId) {
    const inAuthorizedSet = args.auth.authorizedGuildIds.some((guildId) => guildId === requestedGuildId);
    if (!inAuthorizedSet) {
      throw new ScopeGuardError("Campaign is out of scope for the authorized guild set.");
    }

    if (!guildHasVisibleCampaignSlugForMode({
      guildId: requestedGuildId,
      campaignSlug,
      includeArchived: args.includeArchived ?? false,
    })) {
      return null;
    }

    return {
      guildId: requestedGuildId,
      guildName: readGuildNameById(args.auth, requestedGuildId),
      guildIconUrl: readGuildIconById(args.auth, requestedGuildId),
    };
  }

  const matches: Array<{ guildId: string; guildName?: string; guildIconUrl?: string }> = [];
  for (const guildId of args.auth.authorizedGuildIds) {
    if (!guildHasVisibleCampaignSlugForMode({ guildId, campaignSlug, includeArchived: args.includeArchived ?? false })) {
      continue;
    }
    matches.push({
      guildId,
      guildName: readGuildNameById(args.auth, guildId),
      guildIconUrl: readGuildIconById(args.auth, guildId),
    });
  }

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    throw new WebDataError(
      "ambiguous_campaign_scope",
      409,
      `Campaign slug '${campaignSlug}' matches multiple authorized guilds. Provide guild_id to disambiguate.`
    );
  }

  return matches[0] ?? null;
}

export async function listWebSessionsForCampaign(args: {
  guildId: string;
  campaignSlug: string;
  limit?: number;
  includeArchived?: boolean;
}): Promise<SessionSummaryWithStats[]> {
  const rows = listSessionsForGuildCampaign({
    guildId: args.guildId,
    campaignSlug: args.campaignSlug,
    limit: args.limit ?? 25,
    includeArchived: args.includeArchived ?? false,
  });

  return rows.map((row) => {
    let transcriptUnavailable = false;
    let recapUnavailable = false;
    let transcriptWordCount = 0;
    let hasTranscript = false;
    let hasRecap = false;
    const warnings: string[] = [];

    try {
      const transcript = readSessionTranscript({
        guildId: args.guildId,
        campaignSlug: args.campaignSlug,
        sessionId: row.session_id,
      });
      hasTranscript = Boolean(transcript && transcript.lineCount > 0);
      transcriptWordCount = transcript ? transcript.lines.reduce((sum, line) => sum + countWords(line.text), 0) : 0;
    } catch (error) {
      transcriptUnavailable = true;
      warnings.push(error instanceof Error ? error.message : String(error));
    }

    try {
      const recap = readSessionRecap({
        guildId: args.guildId,
        campaignSlug: args.campaignSlug,
        sessionId: row.session_id,
      });
      hasRecap = recap !== null;
    } catch (error) {
      recapUnavailable = true;
      warnings.push(error instanceof Error ? error.message : String(error));
    }

    return {
      session: {
        id: row.session_id,
        label: row.label,
        title: formatSessionDisplayTitle({ label: row.label, sessionId: row.session_id }),
        date: toIsoDate(row.started_at_ms),
        isArchived: row.archived_at_ms !== null,
        startedByUserId: row.started_by_id,
        status:
          row.status === "active"
            ? "in_progress"
            : row.status === "interrupted"
              ? "interrupted"
              : "completed",
        source: row.source === "ingest-media" ? "ingest" : "live",
        sessionOrigin: mapCanonicalSessionOrigin(row),
        artifacts: {
          transcript: buildArtifactStatus({ hasData: hasTranscript, unavailable: transcriptUnavailable }),
          recap: buildArtifactStatus({ hasData: hasRecap, unavailable: recapUnavailable }),
        },
        warnings,
      },
      wordCount: transcriptWordCount,
    };
  });
}

async function listWebCampaignForGuild(args: {
  guildId: string;
  guildName?: string;
  guildIconUrl?: string;
  authorizedUserId?: string | null;
  includeArchived?: boolean;
}): Promise<{ campaigns: CampaignSummary[]; wordsRecorded: number; emptyGuild: DashboardEmptyGuild | null }> {
  const guildDisplayName = resolveGuildDisplayName({ guildId: args.guildId, guildName: args.guildName });
  const guildIconUrl = resolveGuildIconUrl(args.guildIconUrl);
  const configState = getGuildConfigState(args.guildId);
  const showtimeCampaigns = listGuildCampaignRecords(args.guildId);

  const campaigns: CampaignSummary[] = [];
  let wordsRecorded = 0;

  if (showtimeCampaigns.length === 0) {
    const legacyCandidateSlugs = Array.from(
      new Set([configState.campaignSlug, configState.metaCampaignSlug].filter((slug): slug is string => Boolean(slug)))
    );

    for (const campaignSlug of legacyCandidateSlugs) {
      const sessions = await listWebSessionsForCampaign({
        guildId: args.guildId,
        campaignSlug,
        limit: 50,
        includeArchived: args.includeArchived ?? false,
      });

      if (sessions.length === 0) {
        continue;
      }

      const canWrite = canUserWriteCampaignArchive({
        guildId: args.guildId,
        campaignSlug,
        userId: args.authorizedUserId ?? null,
      });

      campaigns.push({
        slug: campaignSlug,
        guildId: args.guildId,
        name: getGuildCampaignDisplayName({ guildId: args.guildId, campaignSlug })
          ?? (sessions.every((entry) => entry.session.sessionOrigin === "lab_legacy")
            ? "Lab legacy"
            : prettifyCampaignSlug(campaignSlug)),
        guildName: guildDisplayName,
        guildIconUrl,
        isDm: canWrite,
        description: `Legacy surfaced archive for ${guildDisplayName}.`,
        sessionCount: sessions.length,
        lastSessionDate: sessions[0]?.session.date ?? null,
        sessions: sessions.map((entry) => entry.session),
        type: "user",
        editable: false,
        persisted: true,
        canWrite,
        ...(canWrite ? {} : { readOnlyReason: "not_campaign_dm" as const }),
      });

      wordsRecorded += sessions.reduce((sum, entry) => sum + entry.wordCount, 0);
    }

    if (campaigns.length > 0) {
      return { campaigns, wordsRecorded, emptyGuild: null };
    }

    return {
      campaigns,
      wordsRecorded,
      emptyGuild: configState.hasGuildConfig
        ? {
            guildId: args.guildId,
            guildName: guildDisplayName,
            guildIconUrl,
          }
        : null,
    };
  }

  for (const campaignRecord of showtimeCampaigns) {
    const campaignSlug = campaignRecord.campaign_slug?.trim();
    if (!campaignSlug) {
      continue;
    }

    const sessions = await listWebSessionsForCampaign({
      guildId: args.guildId,
      campaignSlug,
      limit: 50,
      includeArchived: args.includeArchived ?? false,
    });

    if (sessions.length === 0) {
      continue;
    }

    const campaignName = campaignRecord.campaign_name?.trim() || prettifyCampaignSlug(campaignSlug);

    const canWrite = canUserWriteCampaignArchive({
      guildId: args.guildId,
      campaignSlug,
      userId: args.authorizedUserId ?? null,
    });

    campaigns.push({
      slug: campaignSlug,
      guildId: args.guildId,
      name: campaignName,
      guildName: guildDisplayName,
      guildIconUrl,
      isDm: canWrite,
      description: buildCampaignDescription(guildDisplayName),
      sessionCount: sessions.length,
      lastSessionDate: sessions[0]?.session.date ?? null,
      sessions: sessions.map((entry) => entry.session),
      type: "user",
      editable: true,
      persisted: true,
      canWrite,
      ...(canWrite ? {} : { readOnlyReason: "not_campaign_dm" as const }),
    });

    wordsRecorded += sessions.reduce((sum, entry) => sum + entry.wordCount, 0);
  }

  return { campaigns, wordsRecorded, emptyGuild: null };
}

export async function listWebCampaignsForGuilds(args: {
  authorizedGuildIds: string[];
  authorizedGuilds?: WebAuthorizedGuild[];
  authorizedUserId?: string | null;
  includeDemoFallback?: boolean;
  includeArchived?: boolean;
}): Promise<{ campaigns: CampaignSummary[]; wordsRecorded: number; emptyGuilds: DashboardEmptyGuild[] }> {
  const guildNameMap = new Map<string, string>();
  const guildIconMap = new Map<string, string>();
  for (const guild of args.authorizedGuilds ?? []) {
    const id = guild.id.trim();
    if (!id) continue;
    if (guild.name?.trim()) {
      guildNameMap.set(id, guild.name);
    }
    if (guild.iconUrl?.trim()) {
      guildIconMap.set(id, guild.iconUrl);
    }
  }

  const seen = new Set<string>();
  const uniqueGuildIds = args.authorizedGuildIds.filter((guildId) => {
    const id = guildId.trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const results = await Promise.all(
    uniqueGuildIds.map((guildId) =>
      listWebCampaignForGuild({
        guildId,
        guildName: guildNameMap.get(guildId),
        guildIconUrl: guildIconMap.get(guildId),
        authorizedUserId: args.authorizedUserId ?? null,
        includeArchived: args.includeArchived ?? false,
      })
    )
  );

  const campaigns: CampaignSummary[] = [];
  const emptyGuilds: DashboardEmptyGuild[] = [];
  let wordsRecorded = 0;
  for (const item of results) {
    campaigns.push(...item.campaigns);
    wordsRecorded += item.wordsRecorded;
    if (item.emptyGuild) {
      emptyGuilds.push(item.emptyGuild);
    }
  }

  if (args.includeDemoFallback && campaigns.length === 0) {
    campaigns.push(getDemoCampaignSummary());
  }

  return { campaigns, wordsRecorded, emptyGuilds };
}

function toHomepageSkyCampaign(campaign: CampaignSummary): HomepageSkyCampaignSummary {
  return {
    id: `${campaign.guildId ?? "global"}::${campaign.slug}`,
    slug: campaign.slug,
    name: campaign.name,
    guildIconUrl: campaign.guildIconUrl ?? null,
    sessionCount: campaign.sessionCount,
    lastSessionDate: campaign.lastSessionDate,
    sessions: campaign.sessions.map((session) => ({
      id: session.id,
      label: session.label,
      title: session.title,
      date: session.date,
    })),
  };
}

function toHomepageSkyCampaignFromSessions(args: {
  guildId: string;
  campaignSlug: string;
  guildIconUrl?: string | null;
  sessions: SessionSummaryWithStats[];
}): HomepageSkyCampaignSummary {
  const campaignName = getGuildCampaignDisplayName({ guildId: args.guildId, campaignSlug: args.campaignSlug })
    ?? (args.sessions.every((entry) => entry.session.sessionOrigin === "lab_legacy")
      ? "Lab legacy"
      : prettifyCampaignSlug(args.campaignSlug));

  return {
    id: `${args.guildId}::${args.campaignSlug}`,
    slug: args.campaignSlug,
    name: campaignName,
    guildIconUrl: args.guildIconUrl ?? null,
    sessionCount: args.sessions.length,
    lastSessionDate: args.sessions[0]?.session.date ?? null,
    sessions: args.sessions.map((entry) => ({
      id: entry.session.id,
      label: entry.session.label,
      title: entry.session.title,
      date: entry.session.date,
    })),
  };
}

export async function getHomepageSkyProjection(args?: {
  includeArchived?: boolean;
  viewerUserId?: string | null;
}): Promise<HomepageSkyProjection> {
  const sourceGuildIds = listKnownGuildIds();
  const scopedDirectoryRecords = listScopedCampaignDirectoryRecords();
  const scopedDirectoryGuildIds = dedupeStrings(scopedDirectoryRecords.map((record) => record.guildId));
  const discoveredGuildIds = dedupeStrings([...sourceGuildIds, ...scopedDirectoryGuildIds]);

  logHomepageSkyDiagnostics("discovery", {
    sourceGuildCount: sourceGuildIds.length,
    discoveredGuildCount: discoveredGuildIds.length,
    discoveredGuildIds,
    scopedDirectoryRecordCount: scopedDirectoryRecords.length,
    includeArchived: args?.includeArchived ?? false,
  });

  if (discoveredGuildIds.length === 0 && scopedDirectoryRecords.length === 0) {
    return {
      totalSessions: 0,
      campaignCount: 0,
      wordsRecorded: 0,
      campaigns: [],
      bornStars: [],
      personalAnchorStar: null,
      diagnostics: {
        sourceGuildIds,
        discoveredGuildIds,
        scopedDirectoryGuildIds,
        scopedDirectoryRecordCount: scopedDirectoryRecords.length,
        projectedCampaignIds: [],
        skippedCampaigns: [],
      },
    };
  }

  const durableGuildMetadata = await getGuildDisplayMetadataByIds({ guildIds: discoveredGuildIds });
  const guildNameMap = new Map(durableGuildMetadata.map((guild) => [guild.guildId, guild.guildName]));
  const guildIconMap = new Map(
    durableGuildMetadata
      .filter((guild) => Boolean(guild.guildIcon?.trim()))
      .map((guild) => [guild.guildId, guild.guildIcon!.trim()])
  );

  const results = await Promise.all(
    discoveredGuildIds.map((guildId) =>
      listWebCampaignForGuild({
        guildId,
        guildName: guildNameMap.get(guildId),
        guildIconUrl: guildIconMap.get(guildId),
        includeArchived: args?.includeArchived ?? false,
      })
    )
  );

  const projectedCampaigns = results
    .flatMap((result) => result.campaigns)
    .map(toHomepageSkyCampaign);

  const campaignGuildIconMap = new Map(
    projectedCampaigns.map((campaign) => [campaign.id, campaign.guildIconUrl ?? null])
  );

  const bornStarScopes = new Map<string, { guildId: string; campaignSlug: string }>();
  for (const guildId of discoveredGuildIds) {
    for (const campaign of listGuildCampaignRecords(guildId)) {
      const campaignSlug = campaign.campaign_slug?.trim();
      if (!campaignSlug) {
        continue;
      }

      bornStarScopes.set(`${guildId}::${campaignSlug}`, { guildId, campaignSlug });
    }
  }
  for (const campaign of projectedCampaigns) {
    const [guildId, campaignSlug] = campaign.id.split("::");
    if (guildId && campaignSlug) {
      bornStarScopes.set(`${guildId}::${campaignSlug}`, { guildId, campaignSlug });
    }
  }
  for (const record of scopedDirectoryRecords) {
    bornStarScopes.set(`${record.guildId}::${record.campaignSlug}`, record);
  }

  for (const scope of bornStarScopes.values()) {
    repairMissingBornStarsForCampaignScope({
      guildId: scope.guildId,
      campaignSlug: scope.campaignSlug,
    });
  }

  const bornStars: HomepageSkyBornStarSummary[] = [...bornStarScopes.values()]
    .flatMap((scope) => listBornStarsForGuildCampaign(scope))
    .map((bornStar) => ({
      id: `born::${bornStar.sessionId}`,
      guildId: bornStar.guildId,
      campaignSlug: bornStar.campaignSlug,
      campaignName: bornStar.campaignName
        ?? getGuildCampaignDisplayName({ guildId: bornStar.guildId, campaignSlug: bornStar.campaignSlug })
        ?? prettifyCampaignSlug(bornStar.campaignSlug),
      guildIconUrl: campaignGuildIconMap.get(`${bornStar.guildId}::${bornStar.campaignSlug}`) ?? null,
      sessionId: bornStar.sessionId,
      sessionLabel: bornStar.sessionLabel,
      bornAt: toIsoDateTime(bornStar.bornAtMs),
      lineCount: bornStar.lineCount,
      startedByUserId: bornStar.startedByUserId,
    }))
    .sort((left, right) => {
      if (left.bornAt !== right.bornAt) {
        return right.bornAt.localeCompare(left.bornAt);
      }

      return left.id.localeCompare(right.id);
    });

  const normalizedViewerUserId = args?.viewerUserId?.trim() || null;
  const personalAnchorStar = normalizedViewerUserId
    ? bornStars.find((star) => star.startedByUserId === normalizedViewerUserId) ?? null
    : null;

  const seenCampaigns = new Set(projectedCampaigns.map((campaign) => campaign.id));
  const skippedCampaigns: HomepageSkySkippedCampaign[] = [];
  let wordsRecorded = results.reduce((sum, result) => sum + result.wordsRecorded, 0);

  for (const record of scopedDirectoryRecords) {
    const campaignId = `${record.guildId}::${record.campaignSlug}`;
    if (seenCampaigns.has(campaignId)) {
      skippedCampaigns.push({
        campaignId,
        guildId: record.guildId,
        campaignSlug: record.campaignSlug,
        reason: "already_in_projection",
      });
      logHomepageSkyDiagnostics("skip_campaign", {
        campaignId,
        reason: "already_in_projection",
      });
      continue;
    }

    const sessions = await listWebSessionsForCampaign({
      guildId: record.guildId,
      campaignSlug: record.campaignSlug,
      limit: 50,
      includeArchived: args?.includeArchived ?? false,
    });

    if (sessions.length === 0) {
      skippedCampaigns.push({
        campaignId,
        guildId: record.guildId,
        campaignSlug: record.campaignSlug,
        reason: "no_sessions",
      });
      logHomepageSkyDiagnostics("skip_campaign", {
        campaignId,
        reason: "no_sessions",
      });
      continue;
    }

    projectedCampaigns.push(
      toHomepageSkyCampaignFromSessions({
        guildId: record.guildId,
        campaignSlug: record.campaignSlug,
        guildIconUrl: guildIconMap.get(record.guildId) ?? null,
        sessions,
      })
    );
    campaignGuildIconMap.set(campaignId, guildIconMap.get(record.guildId) ?? null);
    wordsRecorded += sessions.reduce((sum, entry) => sum + entry.wordCount, 0);
    seenCampaigns.add(campaignId);
  }

  projectedCampaigns.sort((left, right) => {
    const rightDate = right.lastSessionDate ?? "";
    const leftDate = left.lastSessionDate ?? "";
    if (rightDate !== leftDate) {
      return rightDate.localeCompare(leftDate);
    }

    if (left.sessionCount !== right.sessionCount) {
      return right.sessionCount - left.sessionCount;
    }

    return left.slug.localeCompare(right.slug);
  });

  const totalSessions = projectedCampaigns.reduce((sum, campaign) => sum + campaign.sessionCount, 0);
  const diagnostics: HomepageSkyDiagnostics = {
    sourceGuildIds,
    discoveredGuildIds,
    scopedDirectoryGuildIds,
    scopedDirectoryRecordCount: scopedDirectoryRecords.length,
    projectedCampaignIds: projectedCampaigns.map((campaign) => campaign.id),
    skippedCampaigns,
  };

  logHomepageSkyDiagnostics("projection_complete", {
    campaignCount: projectedCampaigns.length,
    totalSessions,
    wordsRecorded,
    projectedCampaignIds: diagnostics.projectedCampaignIds,
    skippedCampaignCount: diagnostics.skippedCampaigns.length,
  });

  return {
    totalSessions,
    campaignCount: projectedCampaigns.length,
    wordsRecorded,
    campaigns: projectedCampaigns,
    bornStars,
    personalAnchorStar,
    diagnostics,
  };
}

export async function getWebDashboardModel(args?: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<DashboardModel> {
  let auth = null as Awaited<ReturnType<typeof resolveWebAuthContext>> | null;
  try {
    auth = await resolveWebAuthContext(args?.searchParams);
  } catch (error) {
    if (error instanceof WebAuthError && error.reason === "unsigned") {
      const demoCampaign = getDemoCampaignSummary();
      return {
        totalSessions: 0,
        campaignCount: 1,
        wordsRecorded: 0,
        campaigns: [demoCampaign],
        emptyGuilds: [],
        authState: "unsigned",
      };
    }
    throw error;
  }

  if (auth.authorizedGuildIds.length === 0) {
    return {
      totalSessions: 0,
      campaignCount: 0,
      wordsRecorded: 0,
      campaigns: [],
      emptyGuilds: [],
      authState: "signed_in_no_authorized_guilds",
    };
  }

  const guildStates = auth.authorizedGuildIds.map((guildId) => ({
    guildId,
    config: getGuildConfigState(guildId),
    showtimeCount: listGuildCampaignRecords(guildId).length,
  }));

  const hasMeepoInstalled = guildStates.some((state) => state.config.hasGuildConfig || state.showtimeCount > 0);
  if (!hasMeepoInstalled) {
    return {
      totalSessions: 0,
      campaignCount: 0,
      wordsRecorded: 0,
      campaigns: [],
      emptyGuilds: [],
      authState: "signed_in_no_meepo_installed",
    };
  }

  const model = await listWebCampaignsForGuilds({
    authorizedGuildIds: auth.authorizedGuildIds,
    authorizedGuilds: auth.authorizedGuilds,
    authorizedUserId: auth.user?.id ?? null,
    includeDemoFallback: false,
    includeArchived: readIncludeArchived(args?.searchParams),
  });

  const totalSessions = model.campaigns.reduce((sum, campaign) => sum + campaign.sessionCount, 0);

  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      campaignCount: 0,
      wordsRecorded: model.wordsRecorded,
      campaigns: [],
      emptyGuilds: model.emptyGuilds,
      authState: "signed_in_no_sessions",
    };
  }

  return {
    totalSessions,
    campaignCount: model.campaigns.length,
    wordsRecorded: model.wordsRecorded,
    campaigns: model.campaigns,
    emptyGuilds: model.emptyGuilds,
    authState: "ok",
  };
}

export async function getWebCampaignDetail(args: {
  campaignSlug: string;
  searchParams?: QueryInput;
}): Promise<CampaignSummary | null> {
  const includeArchived = readIncludeArchived(args.searchParams);
  let auth = null as Awaited<ReturnType<typeof resolveWebAuthContext>> | null;
  try {
    auth = await resolveWebAuthContext(args.searchParams);
  } catch (error) {
    if (error instanceof WebAuthError && error.reason === "unsigned") {
      return args.campaignSlug === "demo" ? getDemoCampaignSummary() : null;
    }
    throw error;
  }

  const resolvedScope = resolveGuildScopeForSlug({
    auth,
    campaignSlug: args.campaignSlug,
    searchParams: args.searchParams,
    includeArchived,
  });

  if (!resolvedScope) {
    return null;
  }

  const guildId = resolvedScope.guildId;
  const sessions = await listWebSessionsForCampaign({
    guildId,
    campaignSlug: args.campaignSlug,
    limit: 50,
    includeArchived,
  });
  const archivedSessionCount = includeArchived
    ? sessions.filter((entry) => entry.session.isArchived).length
    : countArchivedSessionsForGuildCampaign({ guildId, campaignSlug: args.campaignSlug });
  const guildDisplayName = resolveGuildDisplayName({ guildId, guildName: resolvedScope.guildName });
  const guildIconUrl = resolveGuildIconUrl(resolvedScope.guildIconUrl);
  const canWrite = canUserWriteCampaignArchive({ guildId, campaignSlug: args.campaignSlug, userId: auth.user?.id ?? null });

  return {
    slug: args.campaignSlug,
    guildId,
    name: getGuildCampaignDisplayName({ guildId, campaignSlug: args.campaignSlug })
      ?? prettifyCampaignSlug(args.campaignSlug),
    guildName: guildDisplayName,
    guildIconUrl,
    isDm: canWrite,
    description: buildCampaignDescription(guildDisplayName),
    sessionCount: sessions.length,
    archivedSessionCount,
    lastSessionDate: sessions[0]?.session.date ?? null,
    sessions: sessions.map((entry) => entry.session),
    type: "user",
    editable: true,
    persisted: true,
    canWrite,
    ...(canWrite ? {} : { readOnlyReason: "not_campaign_dm" as const }),
  };
}

export async function updateWebCampaignName(args: {
  campaignSlug: string;
  campaignName: string | null | undefined;
  searchParams?: QueryInput;
}): Promise<CampaignSummary> {
  const auth = await resolveWebAuthContext(args.searchParams);
  const campaignSlug = args.campaignSlug.trim();
  if (typeof args.campaignName !== "string") {
    throw new WebDataError("invalid_request", 422, "campaignName must be a string.");
  }

  const campaignName = args.campaignName.trim();

  if (!campaignSlug) {
    throw new ScopeGuardError("Campaign is out of scope for the authorized guild set.");
  }

  if (!campaignName) {
     throw new WebDataError("invalid_request", 422, "campaignName cannot be empty.");
  }

  if (campaignName.length > 100) {
     throw new WebDataError("invalid_request", 422, "campaignName exceeds max length (100).");
  }

  const resolvedScope = resolveGuildScopeForSlug({
    auth,
    campaignSlug,
    searchParams: args.searchParams,
  });
  const ownerGuildId = resolvedScope?.guildId ?? null;

  // Upsert is allowed only after proving campaign slug ownership in authorized guild scope.
  if (!ownerGuildId) {
    throw new ScopeGuardError("Campaign is out of scope for the authorized guild set.");
  }

  assertUserCanWriteCampaignArchive({
    guildId: ownerGuildId,
    campaignSlug,
    userId: auth.user?.id ?? null,
  });

  const { getControlDb } = await import("../../../../src/db.js");
  const db = getControlDb();
  const now = Date.now();
  db.prepare(
     `INSERT INTO guild_campaigns (guild_id, campaign_slug, campaign_name, created_at_ms, created_by_user_id, dm_user_id)
      VALUES (?, ?, ?, ?, NULL, NULL)
     ON CONFLICT(guild_id, campaign_slug)
     DO UPDATE SET campaign_name = excluded.campaign_name`
  ).run(ownerGuildId, campaignSlug, campaignName, now);

  const updated = await getWebCampaignDetail({
    campaignSlug,
    searchParams: args.searchParams,
  });

  if (!updated) {
    throw new ScopeGuardError("Campaign is out of scope for the authorized guild set.");
  }

  return updated;
}