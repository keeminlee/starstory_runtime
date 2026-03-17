import type {
  CampaignSummary,
  DashboardModel,
  SessionDetail,
  SessionRecap,
  SessionSpeakerAttributionState,
  SessionSpeakerClassificationType,
  TranscriptEntry,
} from "@/lib/types";
import type {
  RegistryCreateEntryRequest,
  RegistryPendingActionRequest,
  SeenDiscordUserOption,
  RegistrySnapshotDto,
  RegistryUpdateEntryRequest,
} from "@/lib/registry/types";

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

export type CampaignsResponse = {
  dashboard: DashboardModel;
};

export type CampaignSessionsResponse = {
  campaign: CampaignSummary;
};

export type UpdateCampaignNameRequest = {
  campaignName: string;
};

export type UpdateCampaignNameResponse = CampaignSessionsResponse;

export type SessionDetailResponse = {
  session: SessionDetail;
};

export type UpdateSessionLabelRequest = {
  label: string | null;
};

export type UpdateSessionLabelResponse = SessionDetailResponse;

export type SessionTranscriptResponse = {
  sessionId: string;
  campaignSlug: string;
  sessionStatus: SessionDetail["status"];
  status: SessionDetail["artifacts"]["transcript"];
  warnings: string[];
  lineCount: number;
  transcript: TranscriptEntry[];
};

export type SessionRecapResponse = {
  sessionId: string;
  campaignSlug: string;
  status: SessionDetail["artifacts"]["recap"];
  warnings: string[];
  recap: SessionRecap | null;
};

export type RegenerateSessionRecapRequest = {
  reason?: string;
};

export type RegenerateSessionRecapResponse = SessionRecapResponse;

export type CampaignRegistryResponse = {
  registry: RegistrySnapshotDto;
};

export type CampaignSeenDiscordUsersResponse = {
  users: SeenDiscordUserOption[];
};

export type RegistryCreateEntryApiRequest = RegistryCreateEntryRequest;

export type RegistryUpdateEntryApiRequest = RegistryUpdateEntryRequest;

export type RegistryPendingActionApiRequest = RegistryPendingActionRequest;

// ── Chronicle Entity Resolution API types ───────────────────────────

import type {
  EntityCandidateDto,
  EntityResolutionDto,
  EntityAppearanceDto,
  EntityReviewBatchDto,
  EntityReviewDecision,
  RegistryCategoryKey,
} from "@/lib/registry/types";
import type { SessionAnnotatedRecaps } from "@/lib/types";

export type EntityCandidatesResponse = {
  sessionId: string;
  campaignSlug: string;
  candidates: EntityCandidateDto[];
};

export type ResolveEntityRequest = {
  candidateName: string;
  entityId: string;
};

export type CreateEntityFromCandidateRequest = {
  candidateName: string;
  category: RegistryCategoryKey;
  canonicalName?: string;
  notes?: string;
};

export type IgnoreEntityCandidateRequest = {
  candidateName: string;
};

export type EntityResolutionMutationResponse = {
  resolution: EntityResolutionDto;
};

export type SaveEntityReviewBatchRequest = {
  sessionId: string;
  guildId?: string;
  campaignSlug?: string;
  decisions: EntityReviewDecision[];
};

export type SaveEntityReviewBatchResponse = {
  batch: EntityReviewBatchDto;
  candidates: EntityCandidateDto[];
};

export type RevertEntityReviewBatchRequest = {
  sessionId: string;
  batchId: string;
};

export type RevertEntityReviewBatchResponse = {
  batch: EntityReviewBatchDto;
  candidates: EntityCandidateDto[];
};

export type EntityReviewBatchesResponse = {
  sessionId: string;
  batches: EntityReviewBatchDto[];
};

export type SessionAnnotatedRecapsResponse = {
  sessionId: string;
  annotations: SessionAnnotatedRecaps | null;
};

export type SpeakerAttributionCreatePcRequest = {
  canonicalName: string;
  aliases?: string[];
  notes?: string;
};

export type SpeakerAttributionBatchEntryRequest =
  | {
      discordUserId: string;
      classificationType: "pc";
      pcEntityId?: string | null;
      createPc?: SpeakerAttributionCreatePcRequest;
    }
  | {
      discordUserId: string;
      classificationType: Exclude<SessionSpeakerClassificationType, "pc">;
      pcEntityId?: never;
      createPc?: never;
    };

export type SpeakerAttributionBatchRequest = {
  entries: SpeakerAttributionBatchEntryRequest[];
};

export type SessionSpeakerAttributionResponse = {
  sessionId: string;
  campaignSlug: string;
  speakerAttribution: SessionSpeakerAttributionState;
};

export type EntityAppearancesResponse = {
  entityId: string;
  appearances: EntityAppearanceDto[];
};
