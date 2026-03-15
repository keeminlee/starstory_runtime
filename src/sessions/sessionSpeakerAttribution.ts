import { getDbForCampaignScope } from "../db.js";
import { resolveCampaignSlug, getGuildDmUserId } from "../campaign/guildConfig.js";
import { getSessionById } from "./sessions.js";
import { loadRegistryForScope } from "../registry/loadRegistry.js";
import type { Character } from "../registry/types.js";

export const SESSION_SPEAKER_CLASSIFICATION_TYPES = ["pc", "dm", "ignore"] as const;

export type SessionSpeakerClassificationType =
  (typeof SESSION_SPEAKER_CLASSIFICATION_TYPES)[number];

export type SessionSpeaker = {
  discordUserId: string;
  displayName: string;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
};

export type StoredSessionSpeakerClassification = {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
  discordUserId: string;
  classificationType: SessionSpeakerClassificationType;
  pcEntityId: string | null;
  classifiedAtMs: number;
};

export type EffectiveSessionSpeakerClassification = StoredSessionSpeakerClassification & {
  locked: boolean;
  source: "stored" | "auto_dm";
};

export type SessionSpeakerAttributionSpeaker = SessionSpeaker & {
  classification: EffectiveSessionSpeakerClassification | null;
};

export type SessionSpeakerAttributionState = {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
  dmDiscordUserId: string | null;
  ready: boolean;
  required: boolean;
  pendingCount: number;
  speakers: SessionSpeakerAttributionSpeaker[];
};

export type SetSessionSpeakerClassificationInput = {
  discordUserId: string;
  classificationType: SessionSpeakerClassificationType;
  pcEntityId?: string | null;
};

type TranscriptSpeakerRow = {
  author_id: string;
  author_name: string;
  speaker_id: string | null;
  timestamp_ms: number;
};

type SessionSpeakerClassificationRow = {
  guild_id: string;
  campaign_slug: string;
  session_id: string;
  discord_user_id: string;
  classification_type: SessionSpeakerClassificationType;
  pc_entity_id: string | null;
  classified_at_ms: number;
};

function resolveScope(args: {
  guildId: string;
  campaignSlug?: string;
}): { guildId: string; campaignSlug: string } {
  return {
    guildId: args.guildId,
    campaignSlug: args.campaignSlug?.trim() || resolveCampaignSlug({ guildId: args.guildId }),
  };
}

function assertSessionExists(args: { guildId: string; campaignSlug: string; sessionId: string }): void {
  const db = getDbForCampaignScope({ guildId: args.guildId, campaignSlug: args.campaignSlug });
  const session = db
    .prepare("SELECT 1 FROM sessions WHERE guild_id = ? AND session_id = ? LIMIT 1")
    .get(args.guildId, args.sessionId) as { 1: number } | undefined;
  if (!session) {
    throw new Error(`Session not found: ${args.sessionId}`);
  }
}

function resolveSpeakerDiscordUserId(row: TranscriptSpeakerRow): string | null {
  const speakerId = row.speaker_id?.trim();
  if (speakerId) {
    return speakerId;
  }

  const authorId = row.author_id?.trim();
  return authorId || null;
}

function normalizeDisplayName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function mapClassificationRow(row: SessionSpeakerClassificationRow): StoredSessionSpeakerClassification {
  return {
    guildId: row.guild_id,
    campaignSlug: row.campaign_slug,
    sessionId: row.session_id,
    discordUserId: row.discord_user_id,
    classificationType: row.classification_type,
    pcEntityId: row.pc_entity_id,
    classifiedAtMs: row.classified_at_ms,
  };
}

function toEffectiveClassification(args: {
  classification: StoredSessionSpeakerClassification;
}): EffectiveSessionSpeakerClassification {
  return {
    ...args.classification,
    locked: false,
    source: "stored",
  };
}

function toAutoDmClassification(args: {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
  discordUserId: string;
  stored?: StoredSessionSpeakerClassification | null;
}): EffectiveSessionSpeakerClassification {
  return {
    guildId: args.guildId,
    campaignSlug: args.campaignSlug,
    sessionId: args.sessionId,
    discordUserId: args.discordUserId,
    classificationType: "dm",
    pcEntityId: null,
    classifiedAtMs: args.stored?.classifiedAtMs ?? 0,
    locked: true,
    source: args.stored?.classificationType === "dm" ? "stored" : "auto_dm",
  };
}

function assertClassificationInputValue(
  value: string,
  fieldName: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  return trimmed;
}

function getPcEntityById(args: {
  guildId: string;
  campaignSlug: string;
  entityId: string;
}): Character | null {
  const registry = loadRegistryForScope({ guildId: args.guildId, campaignSlug: args.campaignSlug });
  const entity = registry.byId.get(args.entityId);
  if (!entity || !("type" in entity) || entity.type !== "pc") {
    return null;
  }
  return entity;
}

export function getSessionSpeakers(args: {
  guildId: string;
  sessionId: string;
  campaignSlug?: string;
}): SessionSpeaker[] {
  const scope = resolveScope(args);
  assertSessionExists({ ...scope, sessionId: args.sessionId });

  const db = getDbForCampaignScope(scope);
  const rows = db
    .prepare(
      `SELECT author_id, author_name, speaker_id, timestamp_ms
       FROM ledger_entries
       WHERE session_id = ?
         AND source IN ('text', 'voice', 'offline_ingest')
         AND narrative_weight = 'primary'
       ORDER BY timestamp_ms ASC, id ASC`
    )
    .all(args.sessionId) as TranscriptSpeakerRow[];

  const speakers = new Map<string, SessionSpeaker>();
  for (const row of rows) {
    const discordUserId = resolveSpeakerDiscordUserId(row);
    if (!discordUserId) {
      continue;
    }

    const displayName = normalizeDisplayName(row.author_name) ?? discordUserId;
    const existing = speakers.get(discordUserId);
    if (!existing) {
      speakers.set(discordUserId, {
        discordUserId,
        displayName,
        firstSeenAtMs: row.timestamp_ms,
        lastSeenAtMs: row.timestamp_ms,
      });
      continue;
    }

    existing.lastSeenAtMs = row.timestamp_ms;
    const nextDisplayName = normalizeDisplayName(row.author_name);
    if (nextDisplayName) {
      existing.displayName = nextDisplayName;
    }
  }

  return Array.from(speakers.values()).sort((a, b) => a.firstSeenAtMs - b.firstSeenAtMs);
}

export function getSessionSpeakerClassifications(args: {
  guildId: string;
  sessionId: string;
  campaignSlug?: string;
}): StoredSessionSpeakerClassification[] {
  const scope = resolveScope(args);
  assertSessionExists({ ...scope, sessionId: args.sessionId });

  const db = getDbForCampaignScope(scope);
  const rows = db
    .prepare(
      `SELECT guild_id, campaign_slug, session_id, discord_user_id, classification_type, pc_entity_id, classified_at_ms
       FROM session_speaker_classifications
       WHERE session_id = ?
       ORDER BY classified_at_ms DESC, discord_user_id ASC`
    )
    .all(args.sessionId) as SessionSpeakerClassificationRow[];

  return rows.map(mapClassificationRow);
}

export function getSessionSpeakerAttributionState(args: {
  guildId: string;
  sessionId: string;
  campaignSlug?: string;
}): SessionSpeakerAttributionState {
  const scope = resolveScope(args);
  const speakers = getSessionSpeakers({ ...scope, sessionId: args.sessionId });
  const stored = getSessionSpeakerClassifications({ ...scope, sessionId: args.sessionId });
  const storedBySpeaker = new Map(stored.map((entry) => [entry.discordUserId, entry]));
  const dmDiscordUserId = getGuildDmUserId(scope.guildId)?.trim() || null;

  const resolvedSpeakers = speakers.map<SessionSpeakerAttributionSpeaker>((speaker) => {
    const storedClassification = storedBySpeaker.get(speaker.discordUserId) ?? null;
    const classification =
      dmDiscordUserId && speaker.discordUserId === dmDiscordUserId
        ? toAutoDmClassification({
            guildId: scope.guildId,
            campaignSlug: scope.campaignSlug,
            sessionId: args.sessionId,
            discordUserId: speaker.discordUserId,
            stored: storedClassification,
          })
        : storedClassification
          ? toEffectiveClassification({ classification: storedClassification })
          : null;

    return {
      ...speaker,
      classification,
    };
  });

  const pendingCount = resolvedSpeakers.filter((speaker) => speaker.classification === null).length;
  return {
    guildId: scope.guildId,
    campaignSlug: scope.campaignSlug,
    sessionId: args.sessionId,
    dmDiscordUserId,
    required: resolvedSpeakers.length > 0,
    ready: resolvedSpeakers.length > 0 && pendingCount === 0,
    pendingCount,
    speakers: resolvedSpeakers,
  };
}

export function isSessionRecapReady(args: {
  guildId: string;
  sessionId: string;
  campaignSlug?: string;
}): boolean {
  const state = getSessionSpeakerAttributionState(args);
  return !state.required || state.ready;
}

export function setSessionSpeakerClassifications(args: {
  guildId: string;
  sessionId: string;
  campaignSlug?: string;
  entries: SetSessionSpeakerClassificationInput[];
}): SessionSpeakerAttributionState {
  const scope = resolveScope(args);
  assertSessionExists({ ...scope, sessionId: args.sessionId });

  if (!Array.isArray(args.entries) || args.entries.length === 0) {
    throw new Error("At least one speaker attribution entry is required.");
  }

  const speakers = getSessionSpeakers({ ...scope, sessionId: args.sessionId });
  const validSpeakerIds = new Set(speakers.map((speaker) => speaker.discordUserId));
  const dmDiscordUserId = getGuildDmUserId(scope.guildId)?.trim() || null;
  const seen = new Set<string>();

  for (const entry of args.entries) {
    const discordUserId = assertClassificationInputValue(entry.discordUserId, "discordUserId");
    if (seen.has(discordUserId)) {
      throw new Error(`Duplicate speaker attribution entry for ${discordUserId}.`);
    }
    seen.add(discordUserId);

    if (!validSpeakerIds.has(discordUserId)) {
      throw new Error(`Unknown session speaker: ${discordUserId}.`);
    }

    if (!SESSION_SPEAKER_CLASSIFICATION_TYPES.includes(entry.classificationType)) {
      throw new Error(`Unsupported classification type: ${String(entry.classificationType)}`);
    }

    if (entry.classificationType === "pc") {
      const pcEntityId = assertClassificationInputValue(entry.pcEntityId ?? "", "pcEntityId");
      const pcEntity = getPcEntityById({
        guildId: scope.guildId,
        campaignSlug: scope.campaignSlug,
        entityId: pcEntityId,
      });
      if (!pcEntity) {
        throw new Error(`PC entity not found: ${pcEntityId}.`);
      }
      continue;
    }

    if (entry.classificationType === "dm") {
      if (!dmDiscordUserId || discordUserId !== dmDiscordUserId) {
        throw new Error("DM classification must match the configured campaign DM.");
      }
      if (entry.pcEntityId !== undefined && entry.pcEntityId !== null && entry.pcEntityId.trim().length > 0) {
        throw new Error("DM classification cannot set pcEntityId.");
      }
      continue;
    }

    if (entry.pcEntityId !== undefined && entry.pcEntityId !== null && entry.pcEntityId.trim().length > 0) {
      throw new Error("Ignore classification cannot set pcEntityId.");
    }
  }

  const db = getDbForCampaignScope(scope);
  const now = Date.now();
  const statement = db.prepare(
    `INSERT INTO session_speaker_classifications (
       guild_id,
       campaign_slug,
       session_id,
       discord_user_id,
       classification_type,
       pc_entity_id,
       classified_at_ms
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, discord_user_id)
     DO UPDATE SET
       guild_id = excluded.guild_id,
       campaign_slug = excluded.campaign_slug,
       classification_type = excluded.classification_type,
       pc_entity_id = excluded.pc_entity_id,
       classified_at_ms = excluded.classified_at_ms`
  );

  db.transaction(() => {
    for (const entry of args.entries) {
      statement.run(
        scope.guildId,
        scope.campaignSlug,
        args.sessionId,
        entry.discordUserId.trim(),
        entry.classificationType,
        entry.classificationType === "pc" ? entry.pcEntityId?.trim() ?? null : null,
        now,
      );
    }
  })();

  return getSessionSpeakerAttributionState({
    guildId: scope.guildId,
    campaignSlug: scope.campaignSlug,
    sessionId: args.sessionId,
  });
}