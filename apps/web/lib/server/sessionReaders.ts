import { buildSessionDetail } from "@/lib/mappers/sessionMappers";
import { mapToWebDataError, WebDataError } from "@/lib/mappers/errorMappers";
import { resolveWebAuthContext } from "@/lib/server/authContext";
import { assertSessionScope } from "@/lib/server/scopeGuards";
import type { SessionArtifactStatus, SessionDetail } from "@/lib/types";
import type { Session } from "../../../../src/sessions/sessions";
import type { SessionRecap } from "../../../../src/sessions/sessionRecaps";
import type { SessionTranscript } from "../../../../src/sessions/sessionTranscript";

export type CanonicalSessionDetail = {
  guildId: string;
  campaignSlug: string;
  session: Session;
  transcript: SessionTranscript | null;
  recap: SessionRecap | null;
  transcriptStatus: SessionArtifactStatus;
  recapStatus: SessionArtifactStatus;
  warnings: string[];
};

export async function getCanonicalSessionDetail(args: {
  guildId: string;
  sessionId: string;
}): Promise<CanonicalSessionDetail> {
  const [{ getSessionById }, { getSessionTranscript }, { getSessionRecap }, { resolveCampaignSlug }] = await Promise.all([
    import("../../../../src/sessions/sessions"),
    import("../../../../src/sessions/sessionTranscript"),
    import("../../../../src/sessions/sessionRecaps"),
    import("../../../../src/campaign/guildConfig"),
  ]);

  const session = getSessionById(args.guildId, args.sessionId);
  if (!session) {
    throw new WebDataError("not_found", 404, `Session not found: ${args.sessionId}`);
  }
  assertSessionScope({ authGuildId: args.guildId, sessionGuildId: session.guild_id });

  const warnings: string[] = [];
  let transcript = null as SessionTranscript | null;
  let recap: SessionRecap | null = null;
  let transcriptStatus: SessionArtifactStatus = "missing";
  let recapStatus: SessionArtifactStatus = "missing";

  try {
    transcript = getSessionTranscript({
      guildId: args.guildId,
      sessionId: args.sessionId,
      view: "auto",
      primaryOnly: true,
    });
    transcriptStatus = transcript.lineCount > 0 ? "available" : "missing";
  } catch (error) {
    const mapped = mapToWebDataError(error);
    transcriptStatus = mapped.code === "transcript_unavailable" ? "unavailable" : "missing";
    warnings.push(mapped.message);
  }

  try {
    recap = getSessionRecap(args.guildId, args.sessionId);
    recapStatus = recap ? "available" : "missing";
  } catch (error) {
    const mapped = mapToWebDataError(error);
    recapStatus = mapped.code === "recap_unavailable" ? "unavailable" : "missing";
    warnings.push(mapped.message);
    recap = null;
  }

  return {
    guildId: args.guildId,
    campaignSlug: resolveCampaignSlug({ guildId: args.guildId }),
    session,
    transcript,
    recap,
    transcriptStatus,
    recapStatus,
    warnings,
  };
}

export async function getWebSessionDetail(args: {
  sessionId: string;
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<SessionDetail> {
  try {
    const auth = await resolveWebAuthContext(args.searchParams);
    const canonical = await getCanonicalSessionDetail({
      guildId: auth.guildId,
      sessionId: args.sessionId,
    });

    return buildSessionDetail({
      guildId: canonical.guildId,
      campaignSlug: canonical.campaignSlug,
      session: canonical.session,
      transcript: canonical.transcript,
      recap: canonical.recap,
      transcriptStatus: canonical.transcriptStatus,
      recapStatus: canonical.recapStatus,
      warnings: canonical.warnings,
    });
  } catch (error) {
    throw mapToWebDataError(error);
  }
}
