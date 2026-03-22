import type { RegistryCategoryKey, RegistryEntityDto, RegistrySnapshotDto } from "@/lib/registry/types";
import { getDbForCampaignScope } from "../../../../src/db";
import { normKey } from "../../../../src/registry/loadRegistry";

type RegistryMutationType = "entity_created" | "alias_added" | "ignore_added";

type AppliedBatchRow = {
  id: string;
};

type RegistryMutationRow = {
  batch_id: string;
  mutation_type: RegistryMutationType;
  entity_id: string | null;
  alias_text: string | null;
  payload_json: string;
};

function cloneSnapshot(snapshot: RegistrySnapshotDto): RegistrySnapshotDto {
  return {
    campaignSlug: snapshot.campaignSlug,
    categories: {
      pcs: snapshot.categories.pcs.map((entity) => ({ ...entity, aliases: [...entity.aliases] })),
      npcs: snapshot.categories.npcs.map((entity) => ({ ...entity, aliases: [...entity.aliases] })),
      locations: snapshot.categories.locations.map((entity) => ({ ...entity, aliases: [...entity.aliases] })),
      factions: snapshot.categories.factions.map((entity) => ({ ...entity, aliases: [...entity.aliases] })),
      misc: snapshot.categories.misc.map((entity) => ({ ...entity, aliases: [...entity.aliases] })),
    },
    ignoreTokens: [...snapshot.ignoreTokens],
    pending: {
      generatedAt: snapshot.pending.generatedAt,
      sourceCampaignSlug: snapshot.pending.sourceCampaignSlug,
      sourceGuildId: snapshot.pending.sourceGuildId,
      items: snapshot.pending.items.map((item) => ({
        ...item,
        examples: [...item.examples],
        sessions: item.sessions.map((session) => ({ ...session })),
      })),
      knownHits: snapshot.pending.knownHits.map((hit) => ({
        ...hit,
        sessions: hit.sessions.map((session) => ({ ...session })),
      })),
    },
  };
}

function findEntity(snapshot: RegistrySnapshotDto, entityId: string): { category: RegistryCategoryKey; entity: RegistryEntityDto } | null {
  for (const [category, entities] of Object.entries(snapshot.categories) as Array<[RegistryCategoryKey, RegistryEntityDto[]]>) {
    const entity = entities.find((item) => item.id === entityId);
    if (entity) {
      return { category, entity };
    }
  }

  return null;
}

function pushUniqueIgnoreToken(ignoreTokens: string[], token: string): string[] {
  const tokenKey = normKey(token);
  if (!tokenKey) {
    return ignoreTokens;
  }
  if (ignoreTokens.some((item) => normKey(item) === tokenKey)) {
    return ignoreTokens;
  }
  return [...ignoreTokens, token];
}

export function rebuildRegistryFromBatches(args: {
  guildId: string;
  campaignSlug: string;
  baseSnapshot: RegistrySnapshotDto;
}): RegistrySnapshotDto {
  const db = getDbForCampaignScope({ campaignSlug: args.campaignSlug, guildId: args.guildId });
  const appliedBatches = db
    .prepare(
      `SELECT id
       FROM entity_review_batches
       WHERE guild_id = ? AND campaign_slug = ? AND status = 'applied'
       ORDER BY created_at_ms ASC, id ASC`
    )
    .all(args.guildId, args.campaignSlug) as AppliedBatchRow[];

  const snapshot = cloneSnapshot(args.baseSnapshot);

  for (const batch of appliedBatches) {
    const mutations = db
      .prepare(
        `SELECT batch_id, mutation_type, entity_id, alias_text, payload_json
         FROM registry_mutations
         WHERE batch_id = ?
         ORDER BY created_at_ms ASC, id ASC`
      )
      .all(batch.id) as RegistryMutationRow[];

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

        const categoryEntities = snapshot.categories[payload.category];
        if (!categoryEntities.some((entity) => entity.id === mutation.entity_id)) {
          categoryEntities.push({
            id: mutation.entity_id,
            canonicalName: payload.canonicalName,
            aliases: [...payload.aliases],
            notes: payload.notes,
            category: payload.category,
            discordUserId: payload.discordUserId,
          });
        }
        continue;
      }

      if (mutation.mutation_type === "alias_added") {
        if (!mutation.entity_id || !mutation.alias_text) {
          continue;
        }

        const hit = findEntity(snapshot, mutation.entity_id);
        if (!hit) {
          continue;
        }

        if (!hit.entity.aliases.some((alias) => normKey(alias) === normKey(mutation.alias_text!))) {
          hit.entity.aliases = [...hit.entity.aliases, mutation.alias_text];
        }
        continue;
      }

      if (mutation.alias_text) {
        snapshot.ignoreTokens = pushUniqueIgnoreToken(snapshot.ignoreTokens, mutation.alias_text);
      }
    }
  }

  return snapshot;
}