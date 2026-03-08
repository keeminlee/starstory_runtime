"use client";

import { createContext, type ReactNode, useContext } from "react";

export type CampaignRouteType =
  | "campaign-sessions"
  | "campaign-session-detail"
  | "campaign-compendium"
  | "global-dashboard"
  | "global-settings"
  | "other";

export type CampaignContextRouteState = {
  routeType: CampaignRouteType;
  routeCampaignSlug: string | null;
  routeGuildId: string | null;
};

export type CampaignSelectorOption = {
  scopeKey: string;
  slug: string;
  guildId: string | null;
  guildName: string;
  name: string;
  type: "user" | "system";
  editable: boolean;
  persisted: boolean;
};

type CampaignContextValue = {
  activeCampaignSlug: string | null;
  activeGuildId: string | null;
  activeScopeKey: string | null;
  isDemoCampaign: boolean;
  route: CampaignContextRouteState;
  campaigns: CampaignSelectorOption[];
  realCampaigns: CampaignSelectorOption[];
  selectCampaign: (campaignScopeKey: string) => void;
};

const CampaignContext = createContext<CampaignContextValue | null>(null);

type CampaignContextProviderProps = {
  value: CampaignContextValue;
  children: ReactNode;
};

function normalizeGuildId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function buildCampaignScopeKey(args: {
  campaignSlug: string;
  guildId?: string | null;
}): string {
  const guildId = normalizeGuildId(args.guildId);
  return guildId ? `${args.campaignSlug}::${guildId}` : `${args.campaignSlug}::`;
}

export function resolveCampaignRouteState(
  pathname: string,
  searchParams?: URLSearchParams | ReadonlyURLSearchParamsLike
): CampaignContextRouteState {
  const routeGuildId = normalizeGuildId(searchParams?.get("guild_id") ?? searchParams?.get("guildId"));

  if (pathname === "/dashboard") {
    return { routeType: "global-dashboard", routeCampaignSlug: null, routeGuildId };
  }

  if (pathname === "/settings") {
    return { routeType: "global-settings", routeCampaignSlug: null, routeGuildId };
  }

  const parts = pathname.split("/").filter((part) => part.length > 0);
  if (parts.length >= 2 && parts[0] === "campaigns") {
    const campaignSlug = parts[1] ?? null;

    if (parts.length === 3 && parts[2] === "sessions") {
      return { routeType: "campaign-sessions", routeCampaignSlug: campaignSlug, routeGuildId };
    }

    if (parts.length === 4 && parts[2] === "sessions") {
      return { routeType: "campaign-session-detail", routeCampaignSlug: campaignSlug, routeGuildId };
    }

    if (parts.length === 3 && parts[2] === "compendium") {
      return { routeType: "campaign-compendium", routeCampaignSlug: campaignSlug, routeGuildId };
    }

    return { routeType: "other", routeCampaignSlug: campaignSlug, routeGuildId };
  }

  return { routeType: "other", routeCampaignSlug: null, routeGuildId };
}

type ReadonlyURLSearchParamsLike = {
  get: (name: string) => string | null;
};

export function resolveCampaignTargetPath(args: {
  routeType: CampaignRouteType;
  campaignSlug: string;
  guildId?: string | null;
}): string {
  const guildId = normalizeGuildId(args.guildId);
  const suffix = guildId ? `?guild_id=${encodeURIComponent(guildId)}` : "";

  if (args.routeType === "campaign-compendium") {
    return `/campaigns/${args.campaignSlug}/compendium${suffix}`;
  }

  // Session detail cannot be safely remapped across campaigns.
  return `/campaigns/${args.campaignSlug}/sessions${suffix}`;
}

export function CampaignContextProvider({ value, children }: CampaignContextProviderProps) {
  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export function useCampaignContext(): CampaignContextValue {
  const value = useContext(CampaignContext);
  if (!value) {
    throw new Error("useCampaignContext must be used within CampaignContextProvider.");
  }
  return value;
}

export function useActiveCampaign(): string | null {
  return useCampaignContext().activeCampaignSlug;
}

export function useActiveCampaignScope(): { slug: string | null; guildId: string | null } {
  const { activeCampaignSlug, activeGuildId } = useCampaignContext();
  return { slug: activeCampaignSlug, guildId: activeGuildId };
}

export function useIsDemoCampaign(): boolean {
  return useCampaignContext().isDemoCampaign;
}
