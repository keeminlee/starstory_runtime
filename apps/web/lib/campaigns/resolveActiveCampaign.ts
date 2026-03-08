export type CampaignCandidate = {
  slug: string;
  guildId?: string | null;
  name: string;
  type?: "user" | "system";
  editable?: boolean;
  persisted?: boolean;
};

export type CampaignSelection = {
  slug: string;
  guildId: string | null;
};

export type ResolveActiveCampaignSource =
  | "route"
  | "route-ambiguous"
  | "persisted"
  | "first-real"
  | "demo"
  | "none";

export type ResolveActiveCampaignResult = {
  resolvedSlug: string | null;
  resolvedGuildId: string | null;
  source: ResolveActiveCampaignSource;
  isDemo: boolean;
  realCampaignCount: number;
  routeSlugValid: boolean;
  routeGuildIdValid: boolean;
  routeSlugAmbiguous: boolean;
  persistedSlugValid: boolean;
  persistedGuildIdValid: boolean;
};

export type ResolveActiveCampaignInput = {
  routeSlug?: string | null;
  routeGuildId?: string | null;
  persistedSelection?: CampaignSelection | null;
  campaigns: CampaignCandidate[];
  allowDemoFallback?: boolean;
};

export const SYSTEM_DEMO_SLUG = "demo";

function normalizeSlug(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeGuildId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function isSystemCampaign(campaign: CampaignCandidate): boolean {
  if (campaign.type === "system") return true;
  return campaign.slug === SYSTEM_DEMO_SLUG;
}

function matchesSelection(campaign: CampaignCandidate, selection: CampaignSelection): boolean {
  if (campaign.slug !== selection.slug) return false;
  const campaignGuildId = normalizeGuildId(campaign.guildId ?? null);
  return campaignGuildId === normalizeGuildId(selection.guildId);
}

function hasSelection(campaigns: CampaignCandidate[], selection: CampaignSelection): boolean {
  return campaigns.some((campaign) => matchesSelection(campaign, selection));
}

function findBySelection(campaigns: CampaignCandidate[], selection: CampaignSelection): CampaignCandidate | null {
  return campaigns.find((campaign) => matchesSelection(campaign, selection)) ?? null;
}

function findBySlug(campaigns: CampaignCandidate[], slug: string): CampaignCandidate[] {
  return campaigns.filter((campaign) => campaign.slug === slug);
}

function toSelection(campaign: CampaignCandidate): CampaignSelection {
  return {
    slug: campaign.slug,
    guildId: normalizeGuildId(campaign.guildId ?? null),
  };
}

function demoCampaignSlug(campaigns: CampaignCandidate[]): string {
  const explicitDemo = campaigns.find((campaign) => campaign.slug === SYSTEM_DEMO_SLUG);
  return explicitDemo?.slug ?? SYSTEM_DEMO_SLUG;
}

export function resolveActiveCampaign(input: ResolveActiveCampaignInput): ResolveActiveCampaignResult {
  const routeSlug = normalizeSlug(input.routeSlug);
  const routeGuildId = normalizeGuildId(input.routeGuildId);
  const persistedSelection = input.persistedSelection
    ? {
        slug: normalizeSlug(input.persistedSelection.slug) ?? "",
        guildId: normalizeGuildId(input.persistedSelection.guildId),
      }
    : null;
  const campaigns = input.campaigns;
  const allowDemoFallback = input.allowDemoFallback ?? true;

  const routeMatches = routeSlug ? findBySlug(campaigns, routeSlug) : [];
  const routeSlugValid = routeMatches.length > 0;
  const routeGuildIdValid = routeGuildId
    ? routeMatches.some((campaign) => normalizeGuildId(campaign.guildId ?? null) === routeGuildId)
    : false;

  const persistedSlugValid = persistedSelection
    ? persistedSelection.slug.length > 0 && campaigns.some((campaign) => campaign.slug === persistedSelection.slug)
    : false;
  const persistedGuildIdValid = persistedSelection
    ? hasSelection(campaigns, persistedSelection)
    : false;

  const realCampaignCount = campaigns.filter((campaign) => !isSystemCampaign(campaign)).length;

  if (routeSlug) {
    if (routeGuildId) {
      const routeMatch = routeMatches.find(
        (campaign) => normalizeGuildId(campaign.guildId ?? null) === routeGuildId
      );
      if (routeMatch) {
        return {
          resolvedSlug: routeMatch.slug,
          resolvedGuildId: normalizeGuildId(routeMatch.guildId ?? null),
          source: "route",
          isDemo: routeMatch.slug === SYSTEM_DEMO_SLUG,
          realCampaignCount,
          routeSlugValid,
          routeGuildIdValid,
          routeSlugAmbiguous: routeMatches.length > 1,
          persistedSlugValid,
          persistedGuildIdValid,
        };
      }
    }

    if (routeMatches.length === 1) {
      const routeMatch = routeMatches[0];
      return {
        resolvedSlug: routeMatch.slug,
        resolvedGuildId: normalizeGuildId(routeMatch.guildId ?? null),
        source: "route",
        isDemo: routeMatch.slug === SYSTEM_DEMO_SLUG,
        realCampaignCount,
        routeSlugValid,
        routeGuildIdValid,
        routeSlugAmbiguous: false,
        persistedSlugValid,
        persistedGuildIdValid,
      };
    }

    if (routeMatches.length > 1) {
      if (persistedSelection) {
        const persistedMatch = findBySelection(routeMatches, persistedSelection);
        if (persistedMatch) {
          return {
            resolvedSlug: persistedMatch.slug,
            resolvedGuildId: normalizeGuildId(persistedMatch.guildId ?? null),
            source: "persisted",
            isDemo: persistedMatch.slug === SYSTEM_DEMO_SLUG,
            realCampaignCount,
            routeSlugValid,
            routeGuildIdValid,
            routeSlugAmbiguous: true,
            persistedSlugValid,
            persistedGuildIdValid,
          };
        }
      }

      return {
        resolvedSlug: null,
        resolvedGuildId: null,
        source: "route-ambiguous",
        isDemo: false,
        realCampaignCount,
        routeSlugValid,
        routeGuildIdValid,
        routeSlugAmbiguous: true,
        persistedSlugValid,
        persistedGuildIdValid,
      };
    }
  }

  if (persistedSelection && persistedGuildIdValid) {
    return {
      resolvedSlug: persistedSelection.slug,
      resolvedGuildId: persistedSelection.guildId,
      source: "persisted",
      isDemo: persistedSelection.slug === SYSTEM_DEMO_SLUG,
      realCampaignCount,
      routeSlugValid,
      routeGuildIdValid,
      routeSlugAmbiguous: false,
      persistedSlugValid,
      persistedGuildIdValid,
    };
  }

  const firstReal = campaigns.find((campaign) => !isSystemCampaign(campaign)) ?? null;
  if (firstReal) {
    const firstRealSelection = toSelection(firstReal);
    return {
      resolvedSlug: firstRealSelection.slug,
      resolvedGuildId: firstRealSelection.guildId,
      source: "first-real",
      isDemo: false,
      realCampaignCount,
      routeSlugValid,
      routeGuildIdValid,
      routeSlugAmbiguous: false,
      persistedSlugValid,
      persistedGuildIdValid,
    };
  }

  if (allowDemoFallback) {
    const demoSlug = demoCampaignSlug(campaigns);
    return {
      resolvedSlug: demoSlug,
      resolvedGuildId: null,
      source: "demo",
      isDemo: true,
      realCampaignCount,
      routeSlugValid,
      routeGuildIdValid,
      routeSlugAmbiguous: false,
      persistedSlugValid,
      persistedGuildIdValid,
    };
  }

  return {
    resolvedSlug: null,
    resolvedGuildId: null,
    source: "none",
    isDemo: false,
    realCampaignCount,
    routeSlugValid,
    routeGuildIdValid,
    routeSlugAmbiguous: false,
    persistedSlugValid,
    persistedGuildIdValid,
  };
}
