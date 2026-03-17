import type {
  ArchiveRecap as CanonicalSessionRecap,
  ArchiveRecapReadiness,
  ArchiveSessionRow as Session,
  ArchiveTranscript as SessionTranscript,
} from "@/lib/server/readData/archiveReadStore";
import { formatSessionDisplayTitle, prettifyCampaignSlug } from "@/lib/campaigns/display";
import type {
  SessionArtifactStatus,
  SessionDetail,
  SessionOrigin,
  SessionRecap,
  SessionRecapPhase,
  SessionSpeakerAttributionState,
  SessionStatus,
  TranscriptEntry,
} from "@/lib/types";

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function toClockTime(ms: number): string {
  const date = new Date(ms);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function mapCanonicalStatusToWebStatus(status: Session["status"]): SessionStatus {
  if (status === "active") return "in_progress";
  if (status === "interrupted") return "interrupted";
  return "completed";
}

export function mapCanonicalSessionOrigin(session: Pick<Session, "mode_at_start">): SessionOrigin {
  return session.mode_at_start === "lab" ? "lab_legacy" : "showtime";
}

export function mapCanonicalTranscriptToWebTranscript(transcript: SessionTranscript | null): TranscriptEntry[] {
  if (!transcript) return [];

  return transcript.lines.map((line) => ({
    id: `${transcript.sessionId}-line-${line.lineIndex}`,
    speaker: line.speaker,
    text: line.text,
    timestamp: toClockTime(line.timestampMs),
  }));
}

export function mapCanonicalRecapToWebRecap(recap: CanonicalSessionRecap | null): SessionRecap | null {
  if (!recap) return null;

  return {
    concise: recap.views.concise,
    balanced: recap.views.balanced,
    detailed: recap.views.detailed,
    generatedAt: new Date(recap.generatedAt).toISOString(),
    modelVersion: recap.modelVersion,
    source: recap.source,
    engine: recap.engine,
    sourceHash: recap.sourceHash,
    strategyVersion: recap.strategyVersion,
    metaJson: recap.metaJson,
  };
}

export function buildSessionDetail(args: {
  guildId: string;
  campaignSlug: string;
  session: Session;
  transcript: SessionTranscript | null;
  recap: CanonicalSessionRecap | null;
  recapReadiness: ArchiveRecapReadiness;
  recapPhase: SessionRecapPhase;
  speakerAttribution: SessionSpeakerAttributionState | null;
  transcriptStatus: SessionArtifactStatus;
  recapStatus: SessionArtifactStatus;
  warnings?: string[];
  canWrite?: boolean;
}): SessionDetail {
  const source = args.session.source === "ingest-media" ? "ingest" : "live";

  return {
    id: args.session.session_id,
    guildId: args.guildId,
    campaignSlug: args.campaignSlug,
    campaignName: prettifyCampaignSlug(args.campaignSlug),
    label: args.session.label,
    title: formatSessionDisplayTitle({
      label: args.session.label,
      sessionId: args.session.session_id,
    }),
    date: toIsoDate(args.session.started_at_ms),
    isArchived: args.session.archived_at_ms !== null,
    status: mapCanonicalStatusToWebStatus(args.session.status),
    source,
    sessionOrigin: mapCanonicalSessionOrigin(args.session),
    transcript: mapCanonicalTranscriptToWebTranscript(args.transcript),
    recap: mapCanonicalRecapToWebRecap(args.recap),
    recapReadiness: args.recapReadiness,
    recapPhase: args.recapPhase,
    speakerAttribution: args.speakerAttribution,
    artifacts: {
      transcript: args.transcriptStatus,
      recap: args.recapStatus,
    },
    warnings: args.warnings ?? [],
    canWrite: args.canWrite ?? false,
  };
}
