/**
 * Chronicle Entity Resolution Service
 *
 * Concern A: Resolution decisions — per-session candidate resolution state.
 * Manages entity candidate detection from transcripts and DM resolution actions.
 *
 * Hard rules:
 * - Creating a new entity goes through registryService (canonical YAML boundary).
 * - Resolution decisions are persisted in SQLite (entity_resolutions table).
 * - Full annotation recompute on resolution change (no surgical patching).
 */

import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { resolveWebAuthContext } from "@/lib/server/authContext";
import { assertUserCanWriteCampaignArchive } from "@/lib/server/writeAuthority";
import { WebDataError, mapToWebDataError } from "@/lib/mappers/errorMappers";
import { ScopeGuardError } from "@/lib/server/scopeGuards";
import { refreshAnnotationsForSession } from "@/lib/server/recapAnnotationService";
import { readSessionTranscript } from "@/lib/server/readData/archiveReadStore";
import {
  createWebRegistryEntry,
  getWebRegistrySnapshot,
  updateWebRegistryEntry,
} from "@/lib/server/registryService";
import { resolveAuthorizedSessionOwnership } from "@/lib/server/sessionReaders";
import { getDbForCampaignScope } from "../../../../src/db";
import { addAliasIfMissing } from "../../../../src/registry/reviewNamesCore";
import type {
  EntityCandidateDto,
  EntityResolutionDto,
  EntityResolutionStatus,
  RegistryCategoryKey,
} from "@/lib/registry/types";
import { normKey } from "../../../../src/registry/loadRegistry";
import type { ScanSourceRow } from "../../../../src/registry/scanNamesCore";
import { scanNamesCore } from "../../../../src/registry/scanNamesCore";

type QueryInput = Record<string, string | string[] | undefined> | undefined;

async function resolveAuthorizedSession(args: {
  sessionId: string;
  searchParams?: QueryInput;
}): Promise<{ guildId: string; campaignSlug: string; sessionId: string; userId: string | null }> {
  const auth = await resolveWebAuthContext(args.searchParams);
  const { guildId, campaignSlug } = await resolveAuthorizedSessionOwnership({
    authorizedGuildIds: auth.authorizedGuildIds,
    sessionId: args.sessionId,
    searchParams: args.searchParams,
  });
  return { guildId, campaignSlug, sessionId: args.sessionId, userId: auth.user?.id ?? null };
}

// ── Resolution row helpers ─────────────────────────────────────────

type ResolutionRow = {
  id: string;
  session_id: string;
  guild_id: string;
  campaign_slug: string;
  candidate_name: string;
  resolution: EntityResolutionStatus;
  entity_id: string | null;
  entity_category: string | null;
  resolved_at_ms: number;
  updated_at_ms: number;
};

function toDto(row: ResolutionRow): EntityResolutionDto {
  return {
    id: row.id,
    candidateName: row.candidate_name,
    resolution: row.resolution,
    entityId: row.entity_id,
    entityCategory: (row.entity_category as RegistryCategoryKey) ?? null,
    resolvedAt: new Date(row.resolved_at_ms).toISOString(),
  };
}

function loadResolutionsForSession(db: Database.Database, sessionId: string): ResolutionRow[] {
  return db
    .prepare(`SELECT * FROM entity_resolutions WHERE session_id = ?`)
    .all(sessionId) as ResolutionRow[];
}

// ── Entity candidate detection ─────────────────────────────────────

export async function getEntityCandidates(args: {
  sessionId: string;
  searchParams?: QueryInput;
}): Promise<{ sessionId: string; campaignSlug: string; candidates: EntityCandidateDto[] }> {
  try {
    const { guildId, campaignSlug, sessionId } = await resolveAuthorizedSession(args);

    // Load transcript rows for scanning
    const transcript = readSessionTranscript({ guildId, campaignSlug, sessionId });
    if (!transcript || transcript.lineCount === 0) {
      return { sessionId, campaignSlug, candidates: [] };
    }

    const scanRows: ScanSourceRow[] = transcript.lines
      .map((line) => line.text.trim())
      .filter((content) => content.length > 0)
      .map((content) => ({
        content,
        narrative_weight: "primary",
      }));

    // Load registry snapshot for matching
    const registrySnapshot = await getWebRegistrySnapshot({
      campaignSlug,
      searchParams: args.searchParams,
    });

    // Build registry structures for scanNamesCore
    const characters = Object.values(registrySnapshot.categories).flatMap((entities) =>
      entities.map((e) => ({
        id: e.id,
        canonical_name: e.canonicalName,
        type: "npc" as const,
        aliases: e.aliases,
        notes: e.notes,
      }))
    );

    const byName = new Map<string, { id: string; canonical_name: string; category: RegistryCategoryKey }>();
    for (const [category, entities] of Object.entries(registrySnapshot.categories) as Array<
      [RegistryCategoryKey, typeof registrySnapshot.categories.pcs]
    >) {
      for (const entity of entities) {
        const canonicalKey = normKey(entity.canonicalName);
        if (canonicalKey && !byName.has(canonicalKey)) {
          byName.set(canonicalKey, { id: entity.id, canonical_name: entity.canonicalName, category });
        }
        for (const alias of entity.aliases) {
          const aliasKey = normKey(alias);
          if (aliasKey && !byName.has(aliasKey)) {
            byName.set(aliasKey, { id: entity.id, canonical_name: entity.canonicalName, category });
          }
        }
      }
    }

    const ignoreSet = new Set(registrySnapshot.ignoreTokens.map((t) => normKey(t)));

    const scanResult = scanNamesCore({
      rows: scanRows,
      registry: { characters, ignore: ignoreSet, byName: byName as never },
      minCount: 1,
      maxExamples: 3,
      includeKnown: false,
    });

    // Load existing resolution decisions
    const db = getDbForCampaignScope({ campaignSlug, guildId });
    const resolutions = loadResolutionsForSession(db, sessionId);
    const resolutionByName = new Map(resolutions.map((r) => [normKey(r.candidate_name), r]));

    // Build candidate DTOs
    const candidates: EntityCandidateDto[] = scanResult.pending.map((pending) => {
      const existing = resolutionByName.get(normKey(pending.display));
      const candidateKey = normKey(pending.display);

      // Find possible entity matches (exact, alias, fuzzy)
      const possibleMatches: EntityCandidateDto["possibleMatches"] = [];
      const exactMatch = byName.get(candidateKey);
      if (exactMatch) {
        possibleMatches.push({
          entityId: exactMatch.id,
          canonicalName: exactMatch.canonical_name,
          category: exactMatch.category,
          confidence: "exact",
        });
      }

      return {
        candidateName: pending.display,
        mentions: pending.count,
        examples: pending.examples,
        possibleMatches,
        resolution: existing ? toDto(existing) : null,
      };
    });

    return { sessionId, campaignSlug, candidates };
  } catch (error) {
    throw mapToWebDataError(error);
  }
}

// ── Resolution mutations ───────────────────────────────────────────

function upsertResolution(
  db: Database.Database,
  args: {
    sessionId: string;
    guildId: string;
    campaignSlug: string;
    candidateName: string;
    resolution: EntityResolutionStatus;
    entityId: string | null;
    entityCategory: RegistryCategoryKey | null;
  }
): EntityResolutionDto {
  const now = Date.now();
  const id = uuidv4();

  db.prepare(
    `INSERT INTO entity_resolutions (id, session_id, guild_id, campaign_slug, candidate_name, resolution, entity_id, entity_category, resolved_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, candidate_name)
     DO UPDATE SET
       resolution = excluded.resolution,
       entity_id = excluded.entity_id,
       entity_category = excluded.entity_category,
       updated_at_ms = excluded.updated_at_ms`
  ).run(
    id,
    args.sessionId,
    args.guildId,
    args.campaignSlug,
    args.candidateName,
    args.resolution,
    args.entityId,
    args.entityCategory,
    now,
    now
  );

  const row = db
    .prepare(`SELECT * FROM entity_resolutions WHERE session_id = ? AND candidate_name = ?`)
    .get(args.sessionId, args.candidateName) as ResolutionRow;

  return toDto(row);
}

/** Resolve a candidate to an existing registry entity. */
export async function resolveEntity(args: {
  sessionId: string;
  candidateName: string;
  entityId: string;
  searchParams?: QueryInput;
}): Promise<EntityResolutionDto> {
  try {
    const { guildId, campaignSlug, sessionId, userId } = await resolveAuthorizedSession(args);
    assertUserCanWriteCampaignArchive({ guildId, campaignSlug, userId });

    // Validate that the entity exists in the registry
    const registrySnapshot = await getWebRegistrySnapshot({
      campaignSlug,
      searchParams: args.searchParams,
    });

    let foundCategory: RegistryCategoryKey | null = null;
    for (const [category, entities] of Object.entries(registrySnapshot.categories) as Array<
      [RegistryCategoryKey, typeof registrySnapshot.categories.pcs]
    >) {
      if (entities.some((e) => e.id === args.entityId)) {
        foundCategory = category;
        break;
      }
    }

    if (!foundCategory) {
      throw new WebDataError("not_found", 404, `Registry entity not found: ${args.entityId}`);
    }

    const db = getDbForCampaignScope({ campaignSlug, guildId });
    const dto = upsertResolution(db, {
      sessionId,
      guildId,
      campaignSlug,
      candidateName: args.candidateName,
      resolution: "resolved",
      entityId: args.entityId,
      entityCategory: foundCategory,
    });

    // Full annotation recompute (hard rule #3)
    await refreshAnnotationsForSession({ guildId, campaignSlug, sessionId, searchParams: args.searchParams });
    return dto;
  } catch (error) {
    throw mapToWebDataError(error);
  }
}

/**
 * Create a new entity from a candidate name via the canonical registry boundary
 * (registryService.createWebRegistryEntry), then persist the resolution decision.
 */
export async function createEntityFromCandidate(args: {
  sessionId: string;
  candidateName: string;
  category: RegistryCategoryKey;
  canonicalName?: string;
  notes?: string;
  searchParams?: QueryInput;
}): Promise<EntityResolutionDto> {
  try {
    const { guildId, campaignSlug, sessionId, userId } = await resolveAuthorizedSession(args);
    assertUserCanWriteCampaignArchive({ guildId, campaignSlug, userId });

    const finalName = args.canonicalName?.trim() || args.candidateName;
    const finalNameKey = normKey(finalName);
    const candidateNameKey = normKey(args.candidateName);

    const registrySnapshot = await getWebRegistrySnapshot({
      campaignSlug,
      searchParams: args.searchParams,
    });

    const allEntities = Object.entries(registrySnapshot.categories).flatMap(([category, entities]) =>
      entities.map((entity) => ({ ...entity, category: category as RegistryCategoryKey }))
    );

    let matchedEntity = allEntities.find((entity) => normKey(entity.canonicalName) === finalNameKey);
    if (!matchedEntity) {
      matchedEntity = allEntities.find((entity) =>
        entity.aliases.some((alias) => normKey(alias) === finalNameKey)
      );
    }

    let resolution: EntityResolutionStatus = "created";
    let targetEntity: (typeof allEntities)[number] | undefined;
    const shouldPreserveCandidateAlias =
      candidateNameKey.length > 0
      && candidateNameKey !== finalNameKey
      && !allEntities.some(
        (entity) =>
          normKey(entity.canonicalName) === candidateNameKey
          || entity.aliases.some((alias) => normKey(alias) === candidateNameKey)
      );

    if (matchedEntity) {
      const aliasResult = addAliasIfMissing(
        {
          id: matchedEntity.id,
          canonical_name: matchedEntity.canonicalName,
          aliases: matchedEntity.aliases,
          notes: matchedEntity.notes,
          ...(matchedEntity.category === "pcs" && matchedEntity.discordUserId
            ? { discord_user_id: matchedEntity.discordUserId }
            : {}),
        },
        args.candidateName
      );

      await updateWebRegistryEntry({
        campaignSlug,
        entryId: matchedEntity.id,
        searchParams: args.searchParams,
        body: {
          category: matchedEntity.category,
          canonicalName: matchedEntity.canonicalName,
          aliases: aliasResult.entry.aliases ?? matchedEntity.aliases,
          notes: matchedEntity.notes,
          ...(matchedEntity.category === "pcs"
            ? { discordUserId: matchedEntity.discordUserId }
            : {}),
        },
      });

      resolution = "resolved";
      targetEntity = matchedEntity;
    } else {
      const updatedRegistry = await createWebRegistryEntry({
        campaignSlug,
        searchParams: args.searchParams,
        body: {
          category: args.category,
          canonicalName: finalName,
          aliases: shouldPreserveCandidateAlias ? [args.candidateName] : undefined,
          notes: args.notes,
        },
      });

      targetEntity = Object.entries(updatedRegistry.categories)
        .flatMap(([category, entities]) =>
          entities.map((entity) => ({ ...entity, category: category as RegistryCategoryKey }))
        )
        .find((entity) => normKey(entity.canonicalName) === finalNameKey);
    }

    if (!targetEntity) {
      throw new WebDataError("internal", 500, "Entity write completed but target entity could not be found in registry.");
    }

    const db = getDbForCampaignScope({ campaignSlug, guildId });
    const dto = upsertResolution(db, {
      sessionId,
      guildId,
      campaignSlug,
      candidateName: args.candidateName,
      resolution,
      entityId: targetEntity.id,
      entityCategory: targetEntity.category,
    });

    // Full annotation recompute (hard rule #3)
    await refreshAnnotationsForSession({ guildId, campaignSlug, sessionId, searchParams: args.searchParams });
    return dto;
  } catch (error) {
    throw mapToWebDataError(error);
  }
}

/** Ignore a candidate name for this session. */
export async function ignoreEntityCandidate(args: {
  sessionId: string;
  candidateName: string;
  searchParams?: QueryInput;
}): Promise<EntityResolutionDto> {
  try {
    const { guildId, campaignSlug, sessionId, userId } = await resolveAuthorizedSession(args);
    assertUserCanWriteCampaignArchive({ guildId, campaignSlug, userId });

    const db = getDbForCampaignScope({ campaignSlug, guildId });
    const dto = upsertResolution(db, {
      sessionId,
      guildId,
      campaignSlug,
      candidateName: args.candidateName,
      resolution: "ignored",
      entityId: null,
      entityCategory: null,
    });

    // Full annotation recompute (hard rule #3)
    await refreshAnnotationsForSession({ guildId, campaignSlug, sessionId, searchParams: args.searchParams });
    return dto;
  } catch (error) {
    throw mapToWebDataError(error);
  }
}
