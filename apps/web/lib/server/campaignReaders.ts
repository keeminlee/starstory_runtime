import { resolveWebAuthContext } from "@/lib/server/authContext";
import { isCampaignSlugInScope } from "@/lib/server/scopeGuards";
import type { CampaignSummary, DashboardModel, SessionArtifactStatus, SessionSummary } from "@/lib/types";

function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
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

export async function listWebSessionsForCampaign(args: {
  guildId: string;
  campaignSlug: string;
  limit?: number;
}): Promise<SessionSummaryWithStats[]> {
  const [{ resolveCampaignSlug }, { listSessions }, { getSessionTranscript }, { getSessionRecap }] = await Promise.all([
    import("../../../../src/campaign/guildConfig"),
    import("../../../../src/sessions/sessions"),
    import("../../../../src/sessions/sessionTranscript"),
    import("../../../../src/sessions/sessionRecaps"),
  ]);

  const resolvedCampaignSlug = resolveCampaignSlug({ guildId: args.guildId });
  if (!isCampaignSlugInScope({ requestedCampaignSlug: args.campaignSlug, resolvedCampaignSlug })) {
    return [];
  }

  const rows = listSessions(args.guildId, args.limit ?? 25);

  return rows.map((row) => {
    let transcriptUnavailable = false;
    let recapUnavailable = false;
    let transcriptWordCount = 0;
    let hasTranscript = false;
    let hasRecap = false;
    const warnings: string[] = [];

    try {
      const transcript = getSessionTranscript({
        guildId: args.guildId,
        sessionId: row.session_id,
        view: "auto",
        primaryOnly: true,
      });
      hasTranscript = transcript.lineCount > 0;
      transcriptWordCount = transcript.lines.reduce((sum, line) => sum + countWords(line.text), 0);
    } catch (error) {
      transcriptUnavailable = true;
      warnings.push(error instanceof Error ? error.message : String(error));
    }

    try {
      const recap = getSessionRecap(args.guildId, row.session_id);
      hasRecap = recap !== null;
    } catch (error) {
      recapUnavailable = true;
      warnings.push(error instanceof Error ? error.message : String(error));
    }

    return {
      session: {
        id: row.session_id,
        title: row.label ?? row.session_id,
        date: toIsoDate(row.started_at_ms),
        status: row.status === "active" ? "in_progress" : "completed",
        source: row.source === "ingest-media" ? "ingest" : "live",
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

export async function listWebCampaignsForGuild(args: {
  guildId: string;
}): Promise<{ campaigns: CampaignSummary[]; wordsRecorded: number }> {
  const [{ resolveCampaignSlug }] = await Promise.all([
    import("../../../../src/campaign/guildConfig"),
  ]);
  const campaignSlug = resolveCampaignSlug({ guildId: args.guildId });

  const sessions = await listWebSessionsForCampaign({
    guildId: args.guildId,
    campaignSlug,
    limit: 50,
  });

  const summary: CampaignSummary = {
    slug: campaignSlug,
    name: titleCaseSlug(campaignSlug),
    guildName: args.guildId,
    description: `Canonical archive stream for guild ${args.guildId}.`,
    sessionCount: sessions.length,
    lastSessionDate: sessions[0]?.session.date ?? null,
    sessions: sessions.map((entry) => entry.session),
  };

  return {
    campaigns: [summary],
    wordsRecorded: sessions.reduce((sum, entry) => sum + entry.wordCount, 0),
  };
}

export async function getWebDashboardModel(args?: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<DashboardModel> {
  const auth = await resolveWebAuthContext(args?.searchParams);
  const model = await listWebCampaignsForGuild({ guildId: auth.guildId });

  return {
    totalSessions: model.campaigns.reduce((sum, campaign) => sum + campaign.sessionCount, 0),
    campaignCount: model.campaigns.length,
    wordsRecorded: model.wordsRecorded,
    campaigns: model.campaigns,
  };
}

export async function getWebCampaignDetail(args: {
  campaignSlug: string;
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<CampaignSummary | null> {
  const auth = await resolveWebAuthContext(args.searchParams);
  const model = await listWebCampaignsForGuild({ guildId: auth.guildId });
  return model.campaigns.find((campaign) => campaign.slug === args.campaignSlug) ?? null;
}