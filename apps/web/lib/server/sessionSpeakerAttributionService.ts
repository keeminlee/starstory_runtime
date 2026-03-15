import { mapToWebDataError, WebDataError } from "@/lib/mappers/errorMappers";
import type {
  SpeakerAttributionBatchEntryRequest,
  SpeakerAttributionBatchRequest,
} from "@/lib/api/types";
import type {
  SessionSpeakerAttributionState,
  SessionSpeakerAttributionSpeaker,
  SessionSpeakerClassification,
} from "@/lib/types";
import { createWebRegistryEntry } from "@/lib/server/registryService";
import { loadRegistryForScope } from "../../../../src/registry/loadRegistry";
import type { Character } from "../../../../src/registry/types";
import {
  getSessionSpeakerAttributionState,
  setSessionSpeakerClassifications,
  type EffectiveSessionSpeakerClassification,
  type SessionSpeakerAttributionSpeaker as DomainSpeaker,
  type SetSessionSpeakerClassificationInput,
} from "../../../../src/sessions/sessionSpeakerAttribution";

type QueryInput = Record<string, string | string[] | undefined> | undefined;

function toIso(value: number): string {
  return new Date(value).toISOString();
}

function mapPcEntity(entity: Character) {
  return {
    id: entity.id,
    canonicalName: entity.canonical_name,
    aliases: Array.isArray(entity.aliases) ? entity.aliases : [],
    notes: entity.notes ?? "",
    category: "pcs" as const,
    discordUserId: entity.discord_user_id ?? null,
  };
}

function mapClassification(
  classification: EffectiveSessionSpeakerClassification | null,
): SessionSpeakerClassification | null {
  if (!classification) {
    return null;
  }

  return {
    discordUserId: classification.discordUserId,
    classificationType: classification.classificationType,
    pcEntityId: classification.pcEntityId,
    classifiedAt: classification.classifiedAtMs > 0 ? toIso(classification.classifiedAtMs) : null,
    locked: classification.locked,
    source: classification.source,
  };
}

function mapSpeaker(speaker: DomainSpeaker): SessionSpeakerAttributionSpeaker {
  return {
    discordUserId: speaker.discordUserId,
    displayName: speaker.displayName,
    firstSeenAt: toIso(speaker.firstSeenAtMs),
    classification: mapClassification(speaker.classification),
  };
}

export function readSessionSpeakerAttributionSnapshot(args: {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
}): SessionSpeakerAttributionState {
  try {
    const state = getSessionSpeakerAttributionState(args);
    const registry = loadRegistryForScope({ guildId: args.guildId, campaignSlug: args.campaignSlug });
    const availablePcs = registry.characters
      .filter((entity) => entity.type === "pc")
      .map((entity) => mapPcEntity(entity))
      .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));

    return {
      required: state.required,
      ready: state.ready,
      pendingCount: state.pendingCount,
      dmDiscordUserId: state.dmDiscordUserId,
      speakers: state.speakers.map(mapSpeaker),
      availablePcs,
    };
  } catch (error) {
    throw mapToWebDataError(error);
  }
}

export async function saveSessionSpeakerAttributionBatch(args: {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
  searchParams?: QueryInput;
  payload: SpeakerAttributionBatchRequest;
}): Promise<SessionSpeakerAttributionState> {
  try {
    if (!Array.isArray(args.payload.entries) || args.payload.entries.length === 0) {
      throw new WebDataError("invalid_request", 422, "At least one speaker attribution entry is required.");
    }

    const normalizedEntries = new Map<string, SpeakerAttributionBatchEntryRequest>();
    for (const entry of args.payload.entries) {
      const discordUserId = entry.discordUserId?.trim();
      if (!discordUserId) {
        throw new WebDataError("invalid_request", 422, "discordUserId is required for each speaker attribution entry.");
      }
      if (normalizedEntries.has(discordUserId)) {
        throw new WebDataError("invalid_request", 422, `Duplicate speaker attribution entry for '${discordUserId}'.`);
      }
      normalizedEntries.set(discordUserId, {
        ...entry,
        discordUserId,
      });
    }

    const persistedEntries: SetSessionSpeakerClassificationInput[] = [];
    for (const entry of normalizedEntries.values()) {
      if (entry.classificationType === "pc") {
        if (entry.pcEntityId && entry.createPc) {
          throw new WebDataError(
            "invalid_request",
            422,
            `Speaker '${entry.discordUserId}' cannot set both pcEntityId and createPc.`
          );
        }

        let pcEntityId = entry.pcEntityId?.trim() || null;
        if (!pcEntityId && entry.createPc) {
          const canonicalName = entry.createPc.canonicalName?.trim();
          if (!canonicalName) {
            throw new WebDataError("invalid_request", 422, `canonicalName is required for speaker '${entry.discordUserId}'.`);
          }

          const registry = await createWebRegistryEntry({
            campaignSlug: args.campaignSlug,
            searchParams: args.searchParams,
            body: {
              category: "pcs",
              canonicalName,
              aliases: entry.createPc.aliases,
              notes: entry.createPc.notes,
              discordUserId: entry.discordUserId,
            },
          });

          const created = registry.categories.pcs.find(
            (candidate) => candidate.canonicalName === canonicalName && candidate.discordUserId === entry.discordUserId,
          );
          if (!created) {
            throw new WebDataError("internal", 500, "PC creation completed but the created entity could not be resolved.");
          }
          pcEntityId = created.id;
        }

        persistedEntries.push({
          discordUserId: entry.discordUserId,
          classificationType: "pc",
          pcEntityId,
        });
        continue;
      }

      persistedEntries.push({
        discordUserId: entry.discordUserId,
        classificationType: entry.classificationType,
        pcEntityId: null,
      });
    }

    setSessionSpeakerClassifications({
      guildId: args.guildId,
      campaignSlug: args.campaignSlug,
      sessionId: args.sessionId,
      entries: persistedEntries,
    });

    return readSessionSpeakerAttributionSnapshot({
      guildId: args.guildId,
      campaignSlug: args.campaignSlug,
      sessionId: args.sessionId,
    });
  } catch (error) {
    throw mapToWebDataError(error);
  }
}