/**
 * Chronicle Entity Resolution Service
 *
 * Concern A: Resolution decisions — per-session candidate resolution state.
 * Manages entity candidate detection from transcripts and DM resolution actions.
 *
 * Hard rules:
 * - Creating a new entity goes through registryService (canonical YAML boundary).
 * - Resolution decisions are persisted append-only in SQLite (entity_resolutions table).
 * - Batch status determines whether a decision row is active.
 * - Full annotation recompute on applied batch change (no surgical patching).
 */

import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { resolveWebAuthContext } from "@/lib/server/authContext";
import { assertUserCanWriteCampaignArchive } from "@/lib/server/writeAuthority";
import { WebDataError, mapToWebDataError } from "@/lib/mappers/errorMappers";
import { refreshAnnotationsForSession } from "@/lib/server/recapAnnotationService";
import { readSessionTranscript } from "@/lib/server/readData/archiveReadStore";
import {
  addRegistryIgnoreToken,
  createWebRegistryEntry,
  deleteWebRegistryEntry,
  getWebRegistrySnapshot,
  removeAliasFromWebRegistryEntry,
  removeRegistryIgnoreToken,
  updateWebRegistryEntry,
} from "@/lib/server/registryService";
import { resolveAuthorizedSessionOwnership } from "@/lib/server/sessionReaders";
import { getDbForCampaignScope } from "../../../../src/db";
import { addAliasIfMissing } from "../../../../src/registry/reviewNamesCore";
import { normKey } from "../../../../src/registry/loadRegistry";
import { scanNamesCore } from "../../../../src/registry/scanNamesCore";
import type { ScanSourceRow } from "../../../../src/registry/scanNamesCore";
import type {
  EntityCandidateDto,
  EntityResolutionAction,
  EntityResolutionDto,
  EntityResolutionStatus,
  EntityReviewBatchDto,
  EntityReviewBatchStatus,
  EntityReviewDecision,
  RegistryCategoryKey,
  RegistryEntityDto,
} from "@/lib/registry/types";

type QueryInput = Record<string, string | string[] | undefined> | undefined;

type AuthorizedSession = {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
  userId: string | null;
};

type ResolutionRow = {
  id: string;
  session_id: string;
  guild_id: string;
  campaign_slug: string;
  candidate_name: string;
  resolution: EntityResolutionStatus;
  action_type: EntityResolutionAction;
  summary_text: string;
  entity_id: string | null;
  entity_category: string | null;
  batch_id: string | null;
  resolved_at_ms: number;
  updated_at_ms: number;
};

type ReviewBatchRow = {
  id: string;
  session_id: string;
  guild_id: string;
  campaign_slug: string;
  created_by: string | null;
  created_at_ms: number;
  status: EntityReviewBatchStatus;
  decision_count: number;
};

type RegistryMutationType = "entity_created" | "alias_added" | "ignore_added";

type RegistryMutationRow = {
  id: string;
  batch_id: string;
  mutation_type: RegistryMutationType;
  entity_id: string | null;
  alias_text: string | null;
  payload_json: string;
  created_at_ms: number;
};

type RegistryMutationRecord =
  | {
      mutationType: "entity_created";
      entityId: string;
      aliasText: null;
      payload: {
        category: RegistryCategoryKey;
        canonicalName: string;
        aliases: string[];
        notes: string;
        discordUserId: string | null;
      };
    }
  | {
      mutationType: "alias_added";
      entityId: string;
      aliasText: string;
      payload: {
        category: RegistryCategoryKey;
        canonicalName: string;
        aliasText: string;
      };
    }
  | {
      mutationType: "ignore_added";
      entityId: null;
      aliasText: string;
      payload: {
        token: string;
      };
    };

type CoreMutationContext = {
  sessionId: string;
  guildId: string;
  campaignSlug: string;
  searchParams?: QueryInput;
  batchId?: string | null;
};

type CoreMutationResult = {
  resolution: EntityResolutionDto;
  registryMutations: RegistryMutationRecord[];
};

const ACTIVE_BATCH_STATUS: EntityReviewBatchStatus = "applied";
const FAILED_BATCH_STATUS: EntityReviewBatchStatus = "failed";
const REVERTED_BATCH_STATUS: EntityReviewBatchStatus = "reverted";

async function resolveAuthorizedSession(args: {
  sessionId: string;
  searchParams?: QueryInput;
}): Promise<AuthorizedSession> {
  const auth = await resolveWebAuthContext(args.searchParams);
  const { guildId, campaignSlug } = await resolveAuthorizedSessionOwnership({
    authorizedGuildIds: auth.authorizedGuildIds,
    sessionId: args.sessionId,
    searchParams: args.searchParams,
  });
  return { guildId, campaignSlug, sessionId: args.sessionId, userId: auth.user?.id ?? null };
}

function toDto(row: ResolutionRow): EntityResolutionDto {
  return {
    id: row.id,
    candidateName: row.candidate_name,
    resolution: row.resolution,
    action: row.action_type,
    summary: row.summary_text,
    entityId: row.entity_id,
    entityCategory: (row.entity_category as RegistryCategoryKey) ?? null,
    batchId: row.batch_id,
    resolvedAt: new Date(row.resolved_at_ms).toISOString(),
  };
}

function buildResolutionSummary(args: {
  action: EntityResolutionAction;
  candidateName: string;
  category?: RegistryCategoryKey | null;
  targetName?: string | null;
}): string {
  const categoryLabel = args.category
    ? {
        pcs: "PC",
        npcs: "NPC",
        locations: "Location",
        factions: "Faction",
        misc: "Misc",
      }[args.category]
    : null;

  switch (args.action) {
    case "resolve_existing":
      return `Linked ${args.candidateName} to ${categoryLabel ? `${categoryLabel} ` : ""}${args.targetName ?? "entity"}.`;
    case "add_alias":
      return `Aliased ${args.candidateName} into ${categoryLabel ? `${categoryLabel} ` : ""}${args.targetName ?? "entity"}.`;
    case "create_entity":
      if (!args.targetName || args.targetName === args.candidateName) {
        return `Created ${categoryLabel ? `${categoryLabel} ` : ""}${args.candidateName}.`;
      }
      return `Created ${categoryLabel ? `${categoryLabel} ` : ""}${args.targetName} from ${args.candidateName}.`;
    case "ignore_candidate":
      return `Ignored ${args.candidateName}.`;
  }
}

function toBatchDto(row: ReviewBatchRow): EntityReviewBatchDto {
  return {
    id: row.id,
    sessionId: row.session_id,
    guildId: row.guild_id,
    campaignSlug: row.campaign_slug,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at_ms).toISOString(),
    status: row.status,
    decisionCount: row.decision_count,
  };
}

function loadResolutionRowById(db: Database.Database, id: string): ResolutionRow {
  const row = db.prepare(`SELECT * FROM entity_resolutions WHERE id = ?`).get(id) as ResolutionRow | undefined;
  if (!row) {
    throw new WebDataError("internal", 500, `Resolution row not found after insert: ${id}`);
  }
  return row;
}

function loadActiveResolutionRowsForSession(db: Database.Database, sessionId: string): ResolutionRow[] {
  const rows = db
    .prepare(
      `SELECT er.*
       FROM entity_resolutions er
       LEFT JOIN entity_review_batches erb ON erb.id = er.batch_id
       WHERE er.session_id = ?
         AND (er.batch_id IS NULL OR erb.status = ?)
       ORDER BY er.updated_at_ms DESC, er.resolved_at_ms DESC, er.id DESC`
    )
    .all(sessionId, ACTIVE_BATCH_STATUS) as ResolutionRow[];

  const seen = new Set<string>();
  const active: ResolutionRow[] = [];
  for (const row of rows) {
    if (seen.has(row.candidate_name)) {
      continue;
    }
    seen.add(row.candidate_name);
    active.push(row);
  }
  return active;
}

function insertResolution(
  db: Database.Database,
  args: {
    sessionId: string;
    guildId: string;
    campaignSlug: string;
    candidateName: string;
    resolution: EntityResolutionStatus;
    action: EntityResolutionAction;
    summary: string;
    entityId: string | null;
    entityCategory: RegistryCategoryKey | null;
    batchId?: string | null;
  }
): EntityResolutionDto {
  const now = Date.now();
  const id = uuidv4();

  db.prepare(
    `INSERT INTO entity_resolutions (
      id,
      session_id,
      guild_id,
      campaign_slug,
      candidate_name,
      resolution,
      action_type,
      summary_text,
      entity_id,
      entity_category,
      batch_id,
      resolved_at_ms,
      updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    args.sessionId,
    args.guildId,
    args.campaignSlug,
    args.candidateName,
    args.resolution,
    args.action,
    args.summary,
    args.entityId,
    args.entityCategory,
    args.batchId ?? null,
    now,
    now
  );

  return toDto(loadResolutionRowById(db, id));
}

function insertReviewBatch(
  db: Database.Database,
  args: {
    sessionId: string;
    guildId: string;
    campaignSlug: string;
    createdBy: string | null;
    decisionCount: number;
    status?: EntityReviewBatchStatus;
  }
): ReviewBatchRow {
  const id = uuidv4();
  const now = Date.now();
  db.prepare(
    `INSERT INTO entity_review_batches (
      id,
      session_id,
      guild_id,
      campaign_slug,
      created_by,
      created_at_ms,
      status,
      decision_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    args.sessionId,
    args.guildId,
    args.campaignSlug,
    args.createdBy,
    now,
    args.status ?? FAILED_BATCH_STATUS,
    args.decisionCount
  );

  return loadReviewBatchById(db, id);
}

function loadReviewBatchById(db: Database.Database, batchId: string): ReviewBatchRow {
  const row = db
    .prepare(`SELECT * FROM entity_review_batches WHERE id = ? LIMIT 1`)
    .get(batchId) as ReviewBatchRow | undefined;
  if (!row) {
    throw new WebDataError("not_found", 404, `Entity review batch not found: ${batchId}`);
  }
  return row;
}

function updateReviewBatchStatus(
  db: Database.Database,
  batchId: string,
  status: EntityReviewBatchStatus
): ReviewBatchRow {
  db.prepare(`UPDATE entity_review_batches SET status = ? WHERE id = ?`).run(status, batchId);
  return loadReviewBatchById(db, batchId);
}

function logRegistryMutation(
  db: Database.Database,
  batchId: string,
  mutation: RegistryMutationRecord
): void {
  db.prepare(
    `INSERT INTO registry_mutations (
      id,
      batch_id,
      mutation_type,
      entity_id,
      alias_text,
      payload_json,
      created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uuidv4(),
    batchId,
    mutation.mutationType,
    mutation.entityId,
    mutation.aliasText,
    JSON.stringify(mutation.payload),
    Date.now()
  );
}

function loadRegistryMutationsForBatch(
  db: Database.Database,
  batchId: string,
  order: "ASC" | "DESC" = "ASC"
): RegistryMutationRow[] {
  return db
    .prepare(
      `SELECT *
       FROM registry_mutations
       WHERE batch_id = ?
       ORDER BY created_at_ms ${order}, id ${order}`
    )
    .all(batchId) as RegistryMutationRow[];
}

async function findRegistryEntityById(args: {
  campaignSlug: string;
  entityId: string;
  searchParams?: QueryInput;
}): Promise<(RegistryEntityDto & { category: RegistryCategoryKey }) | null> {
  const snapshot = await getWebRegistrySnapshot({
    campaignSlug: args.campaignSlug,
    searchParams: args.searchParams,
  });

  for (const [category, entities] of Object.entries(snapshot.categories) as Array<
    [RegistryCategoryKey, RegistryEntityDto[]]
  >) {
    const found = entities.find((entity) => entity.id === args.entityId);
    if (found) {
      return { ...found, category };
    }
  }

  return null;
}

function countActiveEntityReferencesExcludingBatch(
  db: Database.Database,
  entityId: string,
  batchId: string
): number {
  const rows = db
    .prepare(
      `SELECT er.id
       FROM entity_resolutions er
       LEFT JOIN entity_review_batches erb ON erb.id = er.batch_id
       WHERE er.entity_id = ?
         AND (er.batch_id IS NULL OR er.batch_id != ?)
         AND (er.batch_id IS NULL OR erb.status = ?)`
    )
    .all(entityId, batchId, ACTIVE_BATCH_STATUS) as Array<{ id: string }>;

  return rows.length;
}

function countActiveCandidateReferencesExcludingBatch(
  db: Database.Database,
  candidateKey: string,
  batchId: string,
  resolution?: EntityResolutionStatus
): number {
  const rows = db
    .prepare(
      `SELECT er.candidate_name, er.resolution
       FROM entity_resolutions er
       LEFT JOIN entity_review_batches erb ON erb.id = er.batch_id
       WHERE (er.batch_id IS NULL OR er.batch_id != ?)
         AND (er.batch_id IS NULL OR erb.status = ?)`
    )
    .all(batchId, ACTIVE_BATCH_STATUS) as Array<{ candidate_name: string; resolution: EntityResolutionStatus }>;

  return rows.filter((row) => {
    if (resolution && row.resolution !== resolution) {
      return false;
    }
    return normKey(row.candidate_name) === candidateKey;
  }).length;
}

function aliasesMatch(leftInput: string[], rightInput: string[]): boolean {
  const normalize = (input: string[]) =>
    input
      .map((value) => normKey(value))
      .filter((value) => value.length > 0)
      .sort((left, right) => left.localeCompare(right));

  const left = normalize(leftInput);
  const right = normalize(rightInput);
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

async function assertEntityDeletionAllowed(args: {
  db: Database.Database;
  batchId: string;
  campaignSlug: string;
  searchParams?: QueryInput;
  entityId: string;
  payload: {
    category: RegistryCategoryKey;
    canonicalName: string;
    aliases: string[];
    notes: string;
    discordUserId: string | null;
  };
}): Promise<void> {
  if (countActiveEntityReferencesExcludingBatch(args.db, args.entityId, args.batchId) > 0) {
    throw new WebDataError(
      "conflict",
      409,
      `Cannot revert batch ${args.batchId}: entity ${args.entityId} has surviving active references.`
    );
  }

  const entity = await findRegistryEntityById({
    campaignSlug: args.campaignSlug,
    entityId: args.entityId,
    searchParams: args.searchParams,
  });
  if (!entity) {
    throw new WebDataError("conflict", 409, `Cannot revert batch ${args.batchId}: entity ${args.entityId} is missing.`);
  }

  if (
    entity.category !== args.payload.category
    || normKey(entity.canonicalName) !== normKey(args.payload.canonicalName)
    || !aliasesMatch(entity.aliases, args.payload.aliases)
    || entity.notes !== args.payload.notes
    || (entity.discordUserId ?? null) !== (args.payload.discordUserId ?? null)
  ) {
    throw new WebDataError(
      "conflict",
      409,
      `Cannot revert batch ${args.batchId}: entity ${args.entityId} no longer matches the originally created record.`
    );
  }
}

function assertAliasRemovalAllowed(args: {
  db: Database.Database;
  batchId: string;
  aliasText: string;
}): void {
  const aliasKey = normKey(args.aliasText);
  if (!aliasKey) {
    return;
  }

  if (countActiveCandidateReferencesExcludingBatch(args.db, aliasKey, args.batchId) > 0) {
    throw new WebDataError(
      "conflict",
      409,
      `Cannot revert batch ${args.batchId}: alias '${args.aliasText}' is referenced by another active decision.`
    );
  }
}

function shouldKeepIgnoreToken(args: {
  db: Database.Database;
  batchId: string;
  token: string;
}): boolean {
  const tokenKey = normKey(args.token);
  if (!tokenKey) {
    return false;
  }

  return countActiveCandidateReferencesExcludingBatch(args.db, tokenKey, args.batchId, "ignored") > 0;
}

async function rollbackRegistryMutations(args: {
  db: Database.Database;
  batchId: string;
  campaignSlug: string;
  searchParams?: QueryInput;
  enforceGuards: boolean;
}): Promise<void> {
  const mutations = loadRegistryMutationsForBatch(args.db, args.batchId, "DESC");

  for (const mutation of mutations) {
    if (mutation.mutation_type === "entity_created") {
      if (!mutation.entity_id) {
        continue;
      }

      const payload = JSON.parse(mutation.payload_json) as {
        category: RegistryCategoryKey;
        canonicalName: string;
        aliases: string[];
        notes: string;
        discordUserId: string | null;
      };

      if (args.enforceGuards) {
        await assertEntityDeletionAllowed({
          db: args.db,
          batchId: args.batchId,
          campaignSlug: args.campaignSlug,
          searchParams: args.searchParams,
          entityId: mutation.entity_id,
          payload,
        });
      }

      await deleteWebRegistryEntry({
        campaignSlug: args.campaignSlug,
        entryId: mutation.entity_id,
        category: payload.category,
        searchParams: args.searchParams,
      });
      continue;
    }

    if (mutation.mutation_type === "alias_added") {
      if (!mutation.entity_id || !mutation.alias_text) {
        continue;
      }

      const payload = JSON.parse(mutation.payload_json) as {
        category: RegistryCategoryKey;
      };

      if (args.enforceGuards) {
        assertAliasRemovalAllowed({
          db: args.db,
          batchId: args.batchId,
          aliasText: mutation.alias_text,
        });
      }

      await removeAliasFromWebRegistryEntry({
        campaignSlug: args.campaignSlug,
        entryId: mutation.entity_id,
        category: payload.category,
        aliasText: mutation.alias_text,
        searchParams: args.searchParams,
      });
      continue;
    }

    if (!mutation.alias_text) {
      continue;
    }

    if (args.enforceGuards && shouldKeepIgnoreToken({ db: args.db, batchId: args.batchId, token: mutation.alias_text })) {
      continue;
    }

    await removeRegistryIgnoreToken({
      campaignSlug: args.campaignSlug,
      token: mutation.alias_text,
      searchParams: args.searchParams,
    });
  }
}

async function resolveEntityCore(args: {
  sessionId: string;
  candidateName: string;
  entityId: string;
  guildId: string;
  campaignSlug: string;
  searchParams?: QueryInput;
  batchId?: string | null;
}): Promise<CoreMutationResult> {
  const targetEntity = await findRegistryEntityById({
    campaignSlug: args.campaignSlug,
    entityId: args.entityId,
    searchParams: args.searchParams,
  });
  if (!targetEntity) {
    throw new WebDataError("not_found", 404, `Registry entity not found: ${args.entityId}`);
  }

  const db = getDbForCampaignScope({ campaignSlug: args.campaignSlug, guildId: args.guildId });
  const resolution = insertResolution(db, {
    sessionId: args.sessionId,
    guildId: args.guildId,
    campaignSlug: args.campaignSlug,
    candidateName: args.candidateName,
    resolution: "resolved",
    action: "resolve_existing",
    summary: buildResolutionSummary({
      action: "resolve_existing",
      candidateName: args.candidateName,
      category: targetEntity.category,
      targetName: targetEntity.canonicalName,
    }),
    entityId: targetEntity.id,
    entityCategory: targetEntity.category,
    batchId: args.batchId,
  });

  return { resolution, registryMutations: [] };
}

async function addAliasToEntityCore(args: {
  sessionId: string;
  candidateName: string;
  entityId: string;
  guildId: string;
  campaignSlug: string;
  searchParams?: QueryInput;
  batchId?: string | null;
}): Promise<CoreMutationResult> {
  const targetEntity = await findRegistryEntityById({
    campaignSlug: args.campaignSlug,
    entityId: args.entityId,
    searchParams: args.searchParams,
  });
  if (!targetEntity) {
    throw new WebDataError("not_found", 404, `Registry entity not found: ${args.entityId}`);
  }

  const aliasResult = addAliasIfMissing(
    {
      id: targetEntity.id,
      canonical_name: targetEntity.canonicalName,
      aliases: targetEntity.aliases,
      notes: targetEntity.notes,
      ...(targetEntity.category === "pcs" && targetEntity.discordUserId
        ? { discord_user_id: targetEntity.discordUserId }
        : {}),
    },
    args.candidateName
  );

  if (aliasResult.changed) {
    await updateWebRegistryEntry({
      campaignSlug: args.campaignSlug,
      entryId: targetEntity.id,
      searchParams: args.searchParams,
      body: targetEntity.category === "pcs"
        ? {
            category: "pcs",
            canonicalName: targetEntity.canonicalName,
            aliases: aliasResult.entry.aliases ?? targetEntity.aliases,
            notes: targetEntity.notes,
            discordUserId: targetEntity.discordUserId ?? undefined,
          }
        : {
            category: targetEntity.category,
            canonicalName: targetEntity.canonicalName,
            aliases: aliasResult.entry.aliases ?? targetEntity.aliases,
            notes: targetEntity.notes,
          },
    });
  }

  const db = getDbForCampaignScope({ campaignSlug: args.campaignSlug, guildId: args.guildId });
  const resolution = insertResolution(db, {
    sessionId: args.sessionId,
    guildId: args.guildId,
    campaignSlug: args.campaignSlug,
    candidateName: args.candidateName,
    resolution: "resolved",
    action: "add_alias",
    summary: buildResolutionSummary({
      action: "add_alias",
      candidateName: args.candidateName,
      category: targetEntity.category,
      targetName: targetEntity.canonicalName,
    }),
    entityId: targetEntity.id,
    entityCategory: targetEntity.category,
    batchId: args.batchId,
  });

  return {
    resolution,
    registryMutations: aliasResult.changed
      ? [
          {
            mutationType: "alias_added",
            entityId: targetEntity.id,
            aliasText: args.candidateName,
            payload: {
              category: targetEntity.category,
              canonicalName: targetEntity.canonicalName,
              aliasText: args.candidateName,
            },
          },
        ]
      : [],
  };
}

async function createEntityFromCandidateCore(args: {
  sessionId: string;
  candidateName: string;
  category: RegistryCategoryKey;
  canonicalName?: string;
  notes?: string;
  guildId: string;
  campaignSlug: string;
  searchParams?: QueryInput;
  batchId?: string | null;
}): Promise<CoreMutationResult> {
  const finalName = args.canonicalName?.trim() || args.candidateName;
  const finalNameKey = normKey(finalName);
  const candidateNameKey = normKey(args.candidateName);

  const registrySnapshot = await getWebRegistrySnapshot({
    campaignSlug: args.campaignSlug,
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

  const shouldPreserveCandidateAlias =
    candidateNameKey.length > 0
    && candidateNameKey !== finalNameKey
    && !allEntities.some(
      (entity) =>
        normKey(entity.canonicalName) === candidateNameKey
        || entity.aliases.some((alias) => normKey(alias) === candidateNameKey)
    );

  if (matchedEntity) {
    return addAliasToEntityCore({
      sessionId: args.sessionId,
      candidateName: args.candidateName,
      entityId: matchedEntity.id,
      guildId: args.guildId,
      campaignSlug: args.campaignSlug,
      searchParams: args.searchParams,
      batchId: args.batchId,
    });
  }

  if (args.category === "pcs") {
    throw new WebDataError(
      "invalid_request",
      422,
      "PC creation from entity review is disabled until a Discord user can be assigned in the compendium flow."
    );
  }

  const updatedRegistry = await createWebRegistryEntry({
    campaignSlug: args.campaignSlug,
    searchParams: args.searchParams,
    body: {
      category: args.category,
      canonicalName: finalName,
      aliases: shouldPreserveCandidateAlias ? [args.candidateName] : undefined,
      notes: args.notes,
    },
  });

  const targetEntity = Object.entries(updatedRegistry.categories)
    .flatMap(([category, entities]) =>
      entities.map((entity) => ({ ...entity, category: category as RegistryCategoryKey }))
    )
    .find((entity) => normKey(entity.canonicalName) === finalNameKey);

  if (!targetEntity) {
    throw new WebDataError("internal", 500, "Entity write completed but target entity could not be found in registry.");
  }

  const db = getDbForCampaignScope({ campaignSlug: args.campaignSlug, guildId: args.guildId });
  const resolution = insertResolution(db, {
    sessionId: args.sessionId,
    guildId: args.guildId,
    campaignSlug: args.campaignSlug,
    candidateName: args.candidateName,
    resolution: "created",
    action: "create_entity",
    summary: buildResolutionSummary({
      action: "create_entity",
      candidateName: args.candidateName,
      category: targetEntity.category,
      targetName: targetEntity.canonicalName,
    }),
    entityId: targetEntity.id,
    entityCategory: targetEntity.category,
    batchId: args.batchId,
  });

  return {
    resolution,
    registryMutations: [
      {
        mutationType: "entity_created",
        entityId: targetEntity.id,
        aliasText: null,
        payload: {
          category: targetEntity.category,
          canonicalName: targetEntity.canonicalName,
          aliases: [...targetEntity.aliases],
          notes: targetEntity.notes,
          discordUserId: targetEntity.discordUserId,
        },
      },
    ],
  };
}

async function ignoreEntityCandidateCore(args: CoreMutationContext & {
  candidateName: string;
}): Promise<CoreMutationResult> {
  const ignoreResult = await addRegistryIgnoreToken({
    campaignSlug: args.campaignSlug,
    searchParams: args.searchParams,
    token: args.candidateName,
  });

  const db = getDbForCampaignScope({ campaignSlug: args.campaignSlug, guildId: args.guildId });
  const resolution = insertResolution(db, {
    sessionId: args.sessionId,
    guildId: args.guildId,
    campaignSlug: args.campaignSlug,
    candidateName: args.candidateName,
    resolution: "ignored",
    action: "ignore_candidate",
    summary: buildResolutionSummary({
      action: "ignore_candidate",
      candidateName: args.candidateName,
    }),
    entityId: null,
    entityCategory: null,
    batchId: args.batchId,
  });

  return {
    resolution,
    registryMutations: ignoreResult.changed
      ? [
          {
            mutationType: "ignore_added",
            entityId: null,
            aliasText: args.candidateName,
            payload: {
              token: args.candidateName,
            },
          },
        ]
      : [],
  };
}

function sortDecisions(decisions: EntityReviewDecision[]): EntityReviewDecision[] {
  const rank = (decision: EntityReviewDecision): number => {
    switch (decision.type) {
      case "create_entity":
        return 0;
      case "resolve_existing":
      case "add_alias":
        return 1;
      case "ignore_candidate":
        return 2;
    }
  };

  return [...decisions].sort((left, right) => rank(left) - rank(right));
}

async function validateBatchDecisions(args: {
  sessionId: string;
  campaignSlug: string;
  searchParams?: QueryInput;
  decisions: EntityReviewDecision[];
}): Promise<void> {
  if (args.decisions.length === 0) {
    throw new WebDataError("invalid_request", 422, "At least one decision is required.");
  }

  const candidateResponse = await getEntityCandidates({
    sessionId: args.sessionId,
    searchParams: args.searchParams,
  });
  const candidateByName = new Map(candidateResponse.candidates.map((candidate) => [candidate.candidateName, candidate]));
  const seenCandidates = new Set<string>();

  for (const decision of args.decisions) {
    if (seenCandidates.has(decision.candidateName)) {
      throw new WebDataError("invalid_request", 422, `Duplicate decision for candidate '${decision.candidateName}'.`);
    }
    seenCandidates.add(decision.candidateName);

    const candidate = candidateByName.get(decision.candidateName);
    if (!candidate) {
      throw new WebDataError("invalid_request", 422, `Unknown candidate '${decision.candidateName}'.`);
    }

    if (candidate.resolution) {
      throw new WebDataError(
        "conflict",
        409,
        `Candidate '${decision.candidateName}' already has an active saved decision.`
      );
    }

    if (decision.type === "create_entity") {
      if (!decision.canonicalName.trim()) {
        throw new WebDataError("invalid_request", 422, `Canonical name is required for '${decision.candidateName}'.`);
      }
      continue;
    }

    if (decision.type === "ignore_candidate") {
      continue;
    }

    const entity = await findRegistryEntityById({
      campaignSlug: args.campaignSlug,
      entityId: decision.entityId,
      searchParams: args.searchParams,
    });
    if (!entity) {
      throw new WebDataError("not_found", 404, `Registry entity not found: ${decision.entityId}`);
    }
  }
}

async function applyDecision(
  auth: AuthorizedSession,
  decision: EntityReviewDecision,
  batchId: string,
  searchParams?: QueryInput
): Promise<CoreMutationResult> {
  if (decision.type === "resolve_existing") {
    return resolveEntityCore({
      sessionId: auth.sessionId,
      candidateName: decision.candidateName,
      entityId: decision.entityId,
      guildId: auth.guildId,
      campaignSlug: auth.campaignSlug,
      searchParams,
      batchId,
    });
  }

  if (decision.type === "add_alias") {
    return addAliasToEntityCore({
      sessionId: auth.sessionId,
      candidateName: decision.candidateName,
      entityId: decision.entityId,
      guildId: auth.guildId,
      campaignSlug: auth.campaignSlug,
      searchParams,
      batchId,
    });
  }

  if (decision.type === "create_entity") {
    return createEntityFromCandidateCore({
      sessionId: auth.sessionId,
      candidateName: decision.candidateName,
      category: decision.category,
      canonicalName: decision.canonicalName,
      notes: decision.notes,
      guildId: auth.guildId,
      campaignSlug: auth.campaignSlug,
      searchParams,
      batchId,
    });
  }

  return ignoreEntityCandidateCore({
    sessionId: auth.sessionId,
    candidateName: decision.candidateName,
    guildId: auth.guildId,
    campaignSlug: auth.campaignSlug,
    searchParams,
    batchId,
  });
}

export async function getEntityCandidates(args: {
  sessionId: string;
  searchParams?: QueryInput;
}): Promise<{ sessionId: string; campaignSlug: string; candidates: EntityCandidateDto[] }> {
  try {
    const { guildId, campaignSlug, sessionId } = await resolveAuthorizedSession(args);
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

    const registrySnapshot = await getWebRegistrySnapshot({
      campaignSlug,
      searchParams: args.searchParams,
    });

    const characters = Object.values(registrySnapshot.categories).flatMap((entities) =>
      entities.map((entity) => ({
        id: entity.id,
        canonical_name: entity.canonicalName,
        type: "npc" as const,
        aliases: entity.aliases,
        notes: entity.notes,
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

    const ignoreSet = new Set(registrySnapshot.ignoreTokens.map((token) => normKey(token)));
    const scanResult = scanNamesCore({
      rows: scanRows,
      registry: { characters, ignore: ignoreSet, byName: byName as never },
      minCount: 1,
      maxExamples: 3,
      includeKnown: false,
    });

    const db = getDbForCampaignScope({ campaignSlug, guildId });
    const resolutions = loadActiveResolutionRowsForSession(db, sessionId);
    const resolutionByName = new Map(resolutions.map((row) => [normKey(row.candidate_name), row]));

    const candidates: EntityCandidateDto[] = scanResult.pending.map((pending) => {
      const existing = resolutionByName.get(normKey(pending.display));
      const candidateKey = normKey(pending.display);
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

export async function resolveEntity(args: {
  sessionId: string;
  candidateName: string;
  entityId: string;
  searchParams?: QueryInput;
}): Promise<EntityResolutionDto> {
  try {
    const auth = await resolveAuthorizedSession(args);
    assertUserCanWriteCampaignArchive({ guildId: auth.guildId, campaignSlug: auth.campaignSlug, userId: auth.userId });

    const result = await resolveEntityCore({
      sessionId: auth.sessionId,
      candidateName: args.candidateName,
      entityId: args.entityId,
      guildId: auth.guildId,
      campaignSlug: auth.campaignSlug,
      searchParams: args.searchParams,
      batchId: null,
    });

    await refreshAnnotationsForSession({
      guildId: auth.guildId,
      campaignSlug: auth.campaignSlug,
      sessionId: auth.sessionId,
      searchParams: args.searchParams,
    });
    return result.resolution;
  } catch (error) {
    throw mapToWebDataError(error);
  }
}

export async function createEntityFromCandidate(args: {
  sessionId: string;
  candidateName: string;
  category: RegistryCategoryKey;
  canonicalName?: string;
  notes?: string;
  searchParams?: QueryInput;
}): Promise<EntityResolutionDto> {
  try {
    const auth = await resolveAuthorizedSession(args);
    assertUserCanWriteCampaignArchive({ guildId: auth.guildId, campaignSlug: auth.campaignSlug, userId: auth.userId });

    const result = await createEntityFromCandidateCore({
      sessionId: auth.sessionId,
      candidateName: args.candidateName,
      category: args.category,
      canonicalName: args.canonicalName,
      notes: args.notes,
      guildId: auth.guildId,
      campaignSlug: auth.campaignSlug,
      searchParams: args.searchParams,
      batchId: null,
    });

    await refreshAnnotationsForSession({
      guildId: auth.guildId,
      campaignSlug: auth.campaignSlug,
      sessionId: auth.sessionId,
      searchParams: args.searchParams,
    });
    return result.resolution;
  } catch (error) {
    throw mapToWebDataError(error);
  }
}

export async function ignoreEntityCandidate(args: {
  sessionId: string;
  candidateName: string;
  searchParams?: QueryInput;
}): Promise<EntityResolutionDto> {
  try {
    const auth = await resolveAuthorizedSession(args);
    assertUserCanWriteCampaignArchive({ guildId: auth.guildId, campaignSlug: auth.campaignSlug, userId: auth.userId });

    const result = await ignoreEntityCandidateCore({
      sessionId: auth.sessionId,
      candidateName: args.candidateName,
      guildId: auth.guildId,
      campaignSlug: auth.campaignSlug,
      searchParams: args.searchParams,
      batchId: null,
    });

    await refreshAnnotationsForSession({
      guildId: auth.guildId,
      campaignSlug: auth.campaignSlug,
      sessionId: auth.sessionId,
      searchParams: args.searchParams,
    });
    return result.resolution;
  } catch (error) {
    throw mapToWebDataError(error);
  }
}

export async function getEntityReviewBatchesForSession(args: {
  sessionId: string;
  searchParams?: QueryInput;
}): Promise<{ sessionId: string; batches: EntityReviewBatchDto[] }> {
  try {
    const auth = await resolveAuthorizedSession(args);
    const db = getDbForCampaignScope({ campaignSlug: auth.campaignSlug, guildId: auth.guildId });
    const rows = db
      .prepare(
        `SELECT *
         FROM entity_review_batches
         WHERE session_id = ?
         ORDER BY created_at_ms DESC, id DESC`
      )
      .all(auth.sessionId) as ReviewBatchRow[];

    return {
      sessionId: auth.sessionId,
      batches: rows.map(toBatchDto),
    };
  } catch (error) {
    throw mapToWebDataError(error);
  }
}

export async function saveEntityReviewBatch(args: {
  sessionId: string;
  guildId?: string;
  campaignSlug?: string;
  decisions: EntityReviewDecision[];
  searchParams?: QueryInput;
}): Promise<{ batch: EntityReviewBatchDto; candidates: EntityCandidateDto[] }> {
  try {
    const auth = await resolveAuthorizedSession({ sessionId: args.sessionId, searchParams: args.searchParams });
    assertUserCanWriteCampaignArchive({ guildId: auth.guildId, campaignSlug: auth.campaignSlug, userId: auth.userId });

    if (args.guildId && args.guildId !== auth.guildId) {
      throw new WebDataError("invalid_request", 422, "guildId does not match the resolved session scope.");
    }
    if (args.campaignSlug && args.campaignSlug !== auth.campaignSlug) {
      throw new WebDataError("invalid_request", 422, "campaignSlug does not match the resolved session scope.");
    }

    await validateBatchDecisions({
      sessionId: auth.sessionId,
      campaignSlug: auth.campaignSlug,
      searchParams: args.searchParams,
      decisions: args.decisions,
    });

    const db = getDbForCampaignScope({ campaignSlug: auth.campaignSlug, guildId: auth.guildId });
    let batch = insertReviewBatch(db, {
      sessionId: auth.sessionId,
      guildId: auth.guildId,
      campaignSlug: auth.campaignSlug,
      createdBy: auth.userId,
      decisionCount: args.decisions.length,
      status: FAILED_BATCH_STATUS,
    });

    try {
      for (const decision of sortDecisions(args.decisions)) {
        const result = await applyDecision(auth, decision, batch.id, args.searchParams);
        for (const mutation of result.registryMutations) {
          logRegistryMutation(db, batch.id, mutation);
        }
      }

      batch = updateReviewBatchStatus(db, batch.id, ACTIVE_BATCH_STATUS);
      await refreshAnnotationsForSession({
        guildId: auth.guildId,
        campaignSlug: auth.campaignSlug,
        sessionId: auth.sessionId,
        searchParams: args.searchParams,
      });
    } catch (error) {
      await rollbackRegistryMutations({
        db,
        batchId: batch.id,
        campaignSlug: auth.campaignSlug,
        searchParams: args.searchParams,
        enforceGuards: false,
      });
      updateReviewBatchStatus(db, batch.id, FAILED_BATCH_STATUS);
      throw error;
    }

    const candidates = await getEntityCandidates({
      sessionId: auth.sessionId,
      searchParams: args.searchParams,
    });

    return {
      batch: toBatchDto(batch),
      candidates: candidates.candidates,
    };
  } catch (error) {
    throw mapToWebDataError(error);
  }
}

export async function revertEntityReviewBatch(args: {
  sessionId: string;
  batchId: string;
  searchParams?: QueryInput;
}): Promise<{ batch: EntityReviewBatchDto; candidates: EntityCandidateDto[] }> {
  try {
    const auth = await resolveAuthorizedSession({ sessionId: args.sessionId, searchParams: args.searchParams });
    assertUserCanWriteCampaignArchive({ guildId: auth.guildId, campaignSlug: auth.campaignSlug, userId: auth.userId });

    const db = getDbForCampaignScope({ campaignSlug: auth.campaignSlug, guildId: auth.guildId });
    const batch = loadReviewBatchById(db, args.batchId);
    if (batch.session_id !== auth.sessionId) {
      throw new WebDataError("not_found", 404, `Entity review batch not found for session: ${args.batchId}`);
    }
    if (batch.status !== ACTIVE_BATCH_STATUS) {
      throw new WebDataError(
        "conflict",
        409,
        `Only applied batches can be reverted. Batch ${args.batchId} is ${batch.status}.`
      );
    }

    await rollbackRegistryMutations({
      db,
      batchId: batch.id,
      campaignSlug: auth.campaignSlug,
      searchParams: args.searchParams,
      enforceGuards: true,
    });

    const revertedBatch = updateReviewBatchStatus(db, batch.id, REVERTED_BATCH_STATUS);
    await refreshAnnotationsForSession({
      guildId: auth.guildId,
      campaignSlug: auth.campaignSlug,
      sessionId: auth.sessionId,
      searchParams: args.searchParams,
    });

    const candidates = await getEntityCandidates({
      sessionId: auth.sessionId,
      searchParams: args.searchParams,
    });

    return {
      batch: toBatchDto(revertedBatch),
      candidates: candidates.candidates,
    };
  } catch (error) {
    throw mapToWebDataError(error);
  }
}