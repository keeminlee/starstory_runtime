export type RecapTab = "concise" | "balanced" | "detailed";

export type SessionStatus = "completed" | "in_progress" | "interrupted";

export type SessionArtifactStatus =
  | "available"
  | "missing"
  | "unavailable";

export type SessionRecapReadiness = "pending" | "ready" | "failed";

export type SessionRecapPhase =
  | "live"
  | "ended_pending_attribution"
  | "ended_ready"
  | "generating"
  | "complete"
  | "failed";

export type SessionOrigin = "showtime" | "lab_legacy";

export type SessionSpeakerClassificationType = "pc" | "dm" | "ignore";

export type SessionSpeakerClassification = {
  discordUserId: string;
  classificationType: SessionSpeakerClassificationType;
  pcEntityId: string | null;
  classifiedAt: string | null;
  locked: boolean;
  source: "stored" | "auto_dm";
};

export type SessionSpeakerAttributionSpeaker = {
  discordUserId: string;
  displayName: string;
  firstSeenAt: string;
  classification: SessionSpeakerClassification | null;
};

export type SessionSpeakerAttributionState = {
  required: boolean;
  ready: boolean;
  pendingCount: number;
  dmDiscordUserId: string | null;
  speakers: SessionSpeakerAttributionSpeaker[];
  availablePcs: RegistryEntityDto[];
};

export type SessionSummary = {
  id: string;
  label: string | null;
  title: string;
  date: string;
  isArchived: boolean;
  startedByUserId?: string | null;
  status: SessionStatus;
  source: "live" | "ingest";
  sessionOrigin: SessionOrigin;
  artifacts: {
    transcript: SessionArtifactStatus;
    recap: SessionArtifactStatus;
  };
  warnings: string[];
};

export type CampaignSummary = {
  slug: string;
  guildId: string | null;
  name: string;
  guildName: string;
  guildIconUrl?: string | null;
  isDm?: boolean;
  description: string;
  sessionCount: number;
  lastSessionDate: string | null;
  sessions: SessionSummary[];
  type?: "user" | "system";
  editable?: boolean;
  persisted?: boolean;
  canWrite?: boolean;
  readOnlyReason?: "not_campaign_dm" | "demo_mode";
};

export type DashboardEmptyGuild = {
  guildId: string;
  guildName: string;
  guildIconUrl?: string | null;
};

export type GuildProviderSettingsOption = {
  guildId: string;
  guildName: string;
  guildIconUrl?: string | null;
  canWrite: boolean;
};

export type GuildProviderSettingsModel = {
  selectedGuildId: string;
  selectedGuildName: string;
  selectedGuildIconUrl?: string | null;
  canWriteSelectedGuild: boolean;
  guildOptions: GuildProviderSettingsOption[];
  sttProvider: "whisper" | "deepgram" | null;
  llmProvider: "openai" | "anthropic" | "google" | null;
  effectiveSttProvider: "whisper" | "deepgram" | "noop" | "debug";
  effectiveLlmProvider: "openai" | "anthropic" | "google";
  sttCredentialConfigured: boolean;
  llmCredentialConfigured: boolean;
  sttCredentialEnvKey: string | null;
  llmCredentialEnvKey: string;
};

export type TranscriptEntry = {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
};

export type SessionRecap = {
  concise: string;
  balanced: string;
  detailed: string;
  generatedAt: string;
  modelVersion: string;
  displayModel?: string | null;
  source?: "canonical" | "legacy_artifact" | "legacy_meecap";
  engine?: string | null;
  sourceHash?: string | null;
  strategyVersion?: string | null;
  metaJson?: string | null;
};

export type SessionDetail = {
  id: string;
  campaignSlug: string;
  campaignName: string;
  label: string | null;
  title: string;
  date: string;
  isArchived: boolean;
  status: SessionStatus;
  source: "live" | "ingest";
  sessionOrigin: SessionOrigin;
  guildId: string;
  transcript: TranscriptEntry[];
  recap: SessionRecap | null;
  recapReadiness: SessionRecapReadiness;
  recapPhase: SessionRecapPhase;
  speakerAttribution: SessionSpeakerAttributionState | null;
  artifacts: {
    transcript: SessionArtifactStatus;
    recap: SessionArtifactStatus;
  };
  warnings: string[];
  canWrite?: boolean;
};

export type DashboardModel = {
  totalSessions: number;
  campaignCount: number;
  wordsRecorded: number;
  campaigns: CampaignSummary[];
  emptyGuilds: DashboardEmptyGuild[];
  authState?:
    | "ok"
    | "unsigned"
    | "signed_in_no_authorized_guilds"
    | "signed_in_no_meepo_installed"
    | "signed_in_no_sessions";
};

// ── Annotated Recap Segments ────────────────────────────────────────

import type { RegistryCategoryKey } from "@/lib/registry/types";
import type { RegistryEntityDto } from "@/lib/registry/types";

export type RecapTextSpan = { type: "text"; text: string };
export type RecapEntitySpan = {
  type: "entity";
  text: string;
  entityId: string;
  category: RegistryCategoryKey;
};
export type RecapSpan = RecapTextSpan | RecapEntitySpan;

/** Annotated recap line: original text plus entity spans if annotations exist. */
export type AnnotatedRecapLine = {
  lineIndex: number;
  raw: string;
  spans: RecapSpan[];
};

/** Full annotated recap for one tab, version-aware. */
export type AnnotatedRecap = {
  recapUpdatedAt: string;
  lines: AnnotatedRecapLine[];
};

/** Annotated recaps keyed by tab. Null if no annotations exist yet. */
export type SessionAnnotatedRecaps = {
  concise: AnnotatedRecap | null;
  balanced: AnnotatedRecap | null;
  detailed: AnnotatedRecap | null;
};
