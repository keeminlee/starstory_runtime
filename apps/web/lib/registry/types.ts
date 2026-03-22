export type RegistryCategoryKey = "pcs" | "npcs" | "locations" | "factions" | "misc";

export type RegistryEntityDto = {
  id: string;
  canonicalName: string;
  aliases: string[];
  notes: string;
  category: RegistryCategoryKey;
  discordUserId: string | null;
};

export type SeenDiscordUserOption = {
  discordUserId: string;
  nickname: string;
  username: string | null;
};

export type RegistryPendingCandidateDto = {
  key: string;
  display: string;
  count: number;
  primaryCount: number;
  sentenceInitialCount: number;
  examples: string[];
  sessions: Array<{ sessionId: string; count: number; primaryCount: number }>;
};

export type KnownSessionHitDto = {
  canonicalName: string;
  count: number;
  primaryCount: number;
  sessions: Array<{ sessionId: string; count: number; primaryCount: number }>;
};

export type RegistryPendingDto = {
  generatedAt: string | null;
  sourceCampaignSlug: string | null;
  sourceGuildId: string | null;
  items: RegistryPendingCandidateDto[];
  knownHits: KnownSessionHitDto[];
};

export type RegistrySnapshotDto = {
  campaignSlug: string;
  categories: Record<RegistryCategoryKey, RegistryEntityDto[]>;
  ignoreTokens: string[];
  pending: RegistryPendingDto;
};

export type RegistryCreateEntryRequest =
  | {
      category: "pcs";
      canonicalName: string;
      aliases?: string[];
      notes?: string;
      discordUserId: string;
    }
  | {
      category: Exclude<RegistryCategoryKey, "pcs">;
      canonicalName: string;
      aliases?: string[];
      notes?: string;
      discordUserId?: never;
    };

export type RegistryUpdateEntryRequest =
  | {
      category: "pcs";
      canonicalName?: string;
      aliases?: string[];
      notes?: string;
      discordUserId?: string | null;
    }
  | {
      category: Exclude<RegistryCategoryKey, "pcs">;
      canonicalName?: string;
      aliases?: string[];
      notes?: string;
      discordUserId?: never;
    };

export type RegistryDeleteEntryRequest = {
  category: RegistryCategoryKey;
};

export type RegistryPendingActionRequest =
  | {
      action: "accept";
      key: string;
      category: "pcs";
      canonicalName?: string;
      discordUserId: string;
      notes?: string;
    }
  | {
      action: "accept";
      key: string;
      category: Exclude<RegistryCategoryKey, "pcs">;
      canonicalName?: string;
      discordUserId?: never;
      notes?: string;
    }
  | {
      action: "reject";
      key: string;
    }
  | {
      action: "delete";
      key: string;
    };

// ── Chronicle Entity Resolution ─────────────────────────────────────

export type EntityResolutionStatus = "resolved" | "created" | "ignored";
export type EntityReviewBatchStatus = "applied" | "reverted" | "failed";
export type EntityResolutionAction = "resolve_existing" | "create_entity" | "add_alias" | "ignore_candidate";

/** A candidate name detected in a session, with evidence and possible matches. */
export type EntityCandidateDto = {
  candidateName: string;
  mentions: number;
  examples: string[];
  possibleMatches: {
    entityId: string;
    canonicalName: string;
    category: RegistryCategoryKey;
    confidence: "exact" | "alias" | "fuzzy";
  }[];
  resolution: EntityResolutionDto | null;
};

/** A known canonical entity detected in a session's transcript. */
export type SessionKnownHitDto = {
  canonicalName: string;
  entityId: string;
  category: RegistryCategoryKey;
  count: number;
  primaryCount: number;
};

/** A persisted resolution decision for one candidate name in one session. */
export type EntityResolutionDto = {
  id: string;
  candidateName: string;
  resolution: EntityResolutionStatus;
  action: EntityResolutionAction;
  summary: string;
  entityId: string | null;
  entityCategory: RegistryCategoryKey | null;
  batchId?: string | null;
  resolvedAt: string;
};

export type EntityReviewDecision =
  | {
      type: "resolve_existing";
      candidateName: string;
      entityId: string;
    }
  | {
      type: "create_entity";
      candidateName: string;
      canonicalName: string;
      category: RegistryCategoryKey;
      notes?: string;
    }
  | {
      type: "add_alias";
      candidateName: string;
      entityId: string;
    }
  | {
      type: "ignore_candidate";
      candidateName: string;
    };

export type EntityReviewBatchDto = {
  id: string;
  sessionId: string;
  guildId: string;
  campaignSlug: string;
  createdBy: string | null;
  createdAt: string;
  status: EntityReviewBatchStatus;
  decisionCount: number;
};

/** One appearance of an entity in a session (derived from recap annotations). */
export type EntityAppearanceDto = {
  sessionId: string;
  sessionLabel: string | null;
  sessionDate: string;
  excerpt: string | null;
  mentionCount: number;
};
