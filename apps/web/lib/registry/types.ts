export type RegistryCategoryKey = "pcs" | "npcs" | "locations" | "factions" | "misc";

export type RegistryEntityDto = {
  id: string;
  canonicalName: string;
  aliases: string[];
  notes: string;
  category: RegistryCategoryKey;
  discordUserId: string | null;
};

export type RegistryPendingCandidateDto = {
  key: string;
  display: string;
  count: number;
  primaryCount: number;
  examples: string[];
};

export type RegistryPendingDto = {
  generatedAt: string | null;
  sourceCampaignSlug: string | null;
  sourceGuildId: string | null;
  items: RegistryPendingCandidateDto[];
};

export type RegistrySnapshotDto = {
  campaignSlug: string;
  categories: Record<RegistryCategoryKey, RegistryEntityDto[]>;
  ignoreTokens: string[];
  pending: RegistryPendingDto;
};

export type RegistryCreateEntryRequest = {
  category: RegistryCategoryKey;
  canonicalName: string;
  aliases?: string[];
  notes?: string;
  discordUserId?: string;
};

export type RegistryUpdateEntryRequest = {
  category: RegistryCategoryKey;
  canonicalName?: string;
  aliases?: string[];
  notes?: string;
  discordUserId?: string | null;
};

export type RegistryPendingActionRequest =
  | {
      action: "accept";
      key: string;
      category: RegistryCategoryKey;
      canonicalName?: string;
      discordUserId?: string;
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

/** A persisted resolution decision for one candidate name in one session. */
export type EntityResolutionDto = {
  id: string;
  candidateName: string;
  resolution: EntityResolutionStatus;
  entityId: string | null;
  entityCategory: RegistryCategoryKey | null;
  resolvedAt: string;
};

/** One appearance of an entity in a session (derived from recap annotations). */
export type EntityAppearanceDto = {
  sessionId: string;
  sessionLabel: string | null;
  sessionDate: string;
  excerpt: string | null;
  mentionCount: number;
};
