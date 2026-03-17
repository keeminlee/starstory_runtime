import { fetchJson } from "@/lib/api/http";
import type {
  RegenerateSessionRecapRequest,
  RegenerateSessionRecapResponse,
  SessionDetailResponse,
  SessionRecapResponse,
  SessionSpeakerAttributionResponse,
  SessionTranscriptResponse,
  SpeakerAttributionBatchRequest,
  UpdateSessionLabelRequest,
  UpdateSessionLabelResponse,
  EntityCandidatesResponse,
  ResolveEntityRequest,
  CreateEntityFromCandidateRequest,
  IgnoreEntityCandidateRequest,
  EntityResolutionMutationResponse,
  SaveEntityReviewBatchRequest,
  SaveEntityReviewBatchResponse,
  RevertEntityReviewBatchRequest,
  RevertEntityReviewBatchResponse,
  EntityReviewBatchesResponse,
  SessionAnnotatedRecapsResponse,
  ArchiveSessionResponse,
  EndSessionResponse,
} from "@/lib/api/types";

type QueryInput = Record<string, string | string[] | undefined> | undefined;

function toQuery(input: QueryInput): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export async function getSessionDetailApi(
  sessionId: string,
  searchParams?: QueryInput
): Promise<SessionDetailResponse> {
  return fetchJson<SessionDetailResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    query: toQuery(searchParams),
  });
}

export async function getSessionTranscriptApi(
  sessionId: string,
  searchParams?: QueryInput
): Promise<SessionTranscriptResponse> {
  return fetchJson<SessionTranscriptResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/transcript`, {
    query: toQuery(searchParams),
  });
}

export async function getSessionRecapApi(
  sessionId: string,
  searchParams?: QueryInput
): Promise<SessionRecapResponse> {
  return fetchJson<SessionRecapResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/recap`, {
    query: toQuery(searchParams),
  });
}

export async function getSessionSpeakerAttributionApi(
  sessionId: string,
  searchParams?: QueryInput
): Promise<SessionSpeakerAttributionResponse> {
  return fetchJson<SessionSpeakerAttributionResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/speaker-attribution`,
    {
      query: toQuery(searchParams),
    }
  );
}

export async function saveSessionSpeakerAttributionApi(
  sessionId: string,
  payload: SpeakerAttributionBatchRequest,
  searchParams?: QueryInput
): Promise<SessionSpeakerAttributionResponse> {
  return fetchJson<SessionSpeakerAttributionResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/speaker-attribution`,
    {
      method: "POST",
      query: toQuery(searchParams),
      body: payload,
    }
  );
}

export async function regenerateSessionRecapApi(
  sessionId: string,
  payload: RegenerateSessionRecapRequest,
  searchParams?: QueryInput
): Promise<RegenerateSessionRecapResponse> {
  return fetchJson<RegenerateSessionRecapResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/regenerate`, {
    method: "POST",
    query: toQuery(searchParams),
    body: payload,
  });
}

export async function updateSessionLabelApi(
  sessionId: string,
  payload: UpdateSessionLabelRequest,
  searchParams?: QueryInput
): Promise<UpdateSessionLabelResponse> {
  return fetchJson<UpdateSessionLabelResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    query: toQuery(searchParams),
    body: payload,
  });
}

export async function archiveSessionApi(
  sessionId: string,
  searchParams?: QueryInput
): Promise<ArchiveSessionResponse> {
  return fetchJson<ArchiveSessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/archive`, {
    method: "POST",
    query: toQuery(searchParams),
  });
}

export async function endSessionApi(
  sessionId: string,
  searchParams?: QueryInput
): Promise<EndSessionResponse> {
  return fetchJson<EndSessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/end`, {
    method: "POST",
    query: toQuery(searchParams),
  });
}

// ── Chronicle Entity Resolution ─────────────────────────────────────

export async function getEntityCandidatesApi(
  sessionId: string,
  searchParams?: QueryInput
): Promise<EntityCandidatesResponse> {
  return fetchJson<EntityCandidatesResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/entity-candidates`, {
    query: toQuery(searchParams),
  });
}

export async function resolveEntityApi(
  sessionId: string,
  payload: ResolveEntityRequest,
  searchParams?: QueryInput
): Promise<EntityResolutionMutationResponse> {
  return fetchJson<EntityResolutionMutationResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/resolve-entity`, {
    method: "POST",
    query: toQuery(searchParams),
    body: payload,
  });
}

export async function createEntityFromCandidateApi(
  sessionId: string,
  payload: CreateEntityFromCandidateRequest,
  searchParams?: QueryInput
): Promise<EntityResolutionMutationResponse> {
  return fetchJson<EntityResolutionMutationResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/create-entity-from-candidate`, {
    method: "POST",
    query: toQuery(searchParams),
    body: payload,
  });
}

export async function ignoreEntityCandidateApi(
  sessionId: string,
  payload: IgnoreEntityCandidateRequest,
  searchParams?: QueryInput
): Promise<EntityResolutionMutationResponse> {
  return fetchJson<EntityResolutionMutationResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/ignore-entity-candidate`, {
    method: "POST",
    query: toQuery(searchParams),
    body: payload,
  });
}

export async function saveEntityReviewBatchApi(
  payload: SaveEntityReviewBatchRequest,
  searchParams?: QueryInput
): Promise<SaveEntityReviewBatchResponse> {
  return fetchJson<SaveEntityReviewBatchResponse>("/api/entity-review/save", {
    method: "POST",
    query: toQuery(searchParams),
    body: payload,
  });
}

export async function revertEntityReviewBatchApi(
  payload: RevertEntityReviewBatchRequest,
  searchParams?: QueryInput
): Promise<RevertEntityReviewBatchResponse> {
  return fetchJson<RevertEntityReviewBatchResponse>("/api/entity-review/revert", {
    method: "POST",
    query: toQuery(searchParams),
    body: payload,
  });
}

export async function getEntityReviewBatchesApi(
  sessionId: string,
  searchParams?: QueryInput
): Promise<EntityReviewBatchesResponse> {
  return fetchJson<EntityReviewBatchesResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/entity-review/batches`,
    {
      query: toQuery(searchParams),
    }
  );
}

export async function getAnnotatedRecapsApi(
  sessionId: string,
  searchParams?: QueryInput
): Promise<SessionAnnotatedRecapsResponse> {
  return fetchJson<SessionAnnotatedRecapsResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/annotated-recaps`, {
    query: toQuery(searchParams),
  });
}
