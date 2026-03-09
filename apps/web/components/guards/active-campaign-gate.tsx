"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CampaignsResponse } from "@/lib/api/types";
import {
  resolveActiveCampaign,
  SYSTEM_DEMO_SLUG,
  type CampaignSelection,
  type CampaignCandidate,
} from "@/lib/campaigns/resolveActiveCampaign";
import {
  buildCampaignScopeKey,
  CampaignContextProvider,
  resolveCampaignRouteState,
  resolveCampaignTargetPath,
  type CampaignSelectorOption,
} from "@/components/providers/campaign-context-provider";

const ACTIVE_CAMPAIGN_STORAGE_KEY = "localStorage.meepo.activeCampaign";

type ActiveCampaignGateProps = {
  children: ReactNode;
};

type CampaignLoadState = "loading" | "ready" | "error";
type DashboardAuthState = CampaignsResponse["dashboard"]["authState"];

function mapCampaignOption(campaign: CampaignsResponse["dashboard"]["campaigns"][number]): CampaignSelectorOption {
  const type = campaign.type === "system" ? "system" : "user";
  const guildId = campaign.guildId?.trim() ? campaign.guildId : null;
  return {
    scopeKey: buildCampaignScopeKey({ campaignSlug: campaign.slug, guildId }),
    slug: campaign.slug,
    guildId,
    guildName: campaign.guildName,
    name: campaign.name,
    type,
    editable: campaign.editable ?? type !== "system",
    persisted: campaign.persisted ?? type !== "system",
  };
}

function normalizeGuildId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function readPersistedCampaignSelection(): CampaignSelection | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(ACTIVE_CAMPAIGN_STORAGE_KEY);
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length === 0) return null;

  try {
    const parsed = JSON.parse(trimmed) as { slug?: unknown; guildId?: unknown };
    if (typeof parsed.slug === "string" && parsed.slug.trim().length > 0) {
      return {
        slug: parsed.slug.trim(),
        guildId: typeof parsed.guildId === "string" ? normalizeGuildId(parsed.guildId) : null,
      };
    }
  } catch {
    return {
      slug: trimmed,
      guildId: null,
    };
  }

  return null;
}

function writePersistedCampaignSelection(selection: CampaignSelection | null): void {
  if (typeof window === "undefined") return;
  if (!selection) {
    window.localStorage.removeItem(ACTIVE_CAMPAIGN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_CAMPAIGN_STORAGE_KEY, JSON.stringify(selection));
}

export function ActiveCampaignGate({ children }: ActiveCampaignGateProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const route = useMemo(() => resolveCampaignRouteState(pathname, searchParams), [pathname, searchParams]);

  const [campaigns, setCampaigns] = useState<CampaignSelectorOption[]>([]);
  const [loadState, setLoadState] = useState<CampaignLoadState>("loading");
  const [dashboardAuthState, setDashboardAuthState] = useState<DashboardAuthState>("ok");
  const [persistedSelection, setPersistedSelection] = useState<CampaignSelection | null>(null);

  useEffect(() => {
    setPersistedSelection(readPersistedCampaignSelection());
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadCampaigns() {
      setLoadState("loading");
      try {
        const response = await fetch("/api/campaigns", {
          method: "GET",
          cache: "no-store",
          headers: {
            "content-type": "application/json",
          },
        });

        if (!response.ok) {
          if (mounted) {
            setCampaigns([]);
            setDashboardAuthState("ok");
            setLoadState("error");
          }
          return;
        }

        const payload = (await response.json()) as CampaignsResponse;
        const nextCampaigns = payload.dashboard.campaigns.map(mapCampaignOption);

        if (mounted) {
          setCampaigns(nextCampaigns);
          setDashboardAuthState(payload.dashboard.authState ?? "ok");
          setLoadState("ready");
        }
      } catch {
        if (mounted) {
          setCampaigns([]);
          setDashboardAuthState("ok");
          setLoadState("error");
        }
      }
    }

    void loadCampaigns();
    return () => {
      mounted = false;
    };
  }, []);

  const resolved = useMemo(
    () =>
      resolveActiveCampaign({
        routeSlug: route.routeCampaignSlug,
        routeGuildId: route.routeGuildId,
        persistedSelection,
        campaigns: campaigns as CampaignCandidate[],
        allowDemoFallback: loadState !== "error" && dashboardAuthState !== "signed_in_no_authorized_guilds",
      }),
    [campaigns, dashboardAuthState, loadState, persistedSelection, route.routeCampaignSlug, route.routeGuildId]
  );

  const activeCampaignSlug = resolved.resolvedSlug;
  const activeGuildId = resolved.resolvedGuildId;
  const activeScopeKey = activeCampaignSlug
    ? buildCampaignScopeKey({ campaignSlug: activeCampaignSlug, guildId: activeGuildId })
    : null;
  const isDemoCampaign = activeCampaignSlug === SYSTEM_DEMO_SLUG;

  const realCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.type === "user"),
    [campaigns]
  );

  useEffect(() => {
    if (loadState !== "ready") return;

    const selected = campaigns.find((campaign) => campaign.scopeKey === activeScopeKey) ?? null;
    if (!selected || !selected.persisted) {
      writePersistedCampaignSelection(null);
      setPersistedSelection(null);
      return;
    }

    const nextSelection: CampaignSelection = {
      slug: selected.slug,
      guildId: selected.guildId,
    };
    const currentPersisted = readPersistedCampaignSelection();
    const changed =
      currentPersisted?.slug !== nextSelection.slug
      || currentPersisted?.guildId !== nextSelection.guildId;
    if (changed) {
      writePersistedCampaignSelection(nextSelection);
      setPersistedSelection(nextSelection);
    }
  }, [activeScopeKey, campaigns, loadState]);

  const selectCampaign = useCallback(
    (campaignScopeKey: string) => {
      if (!campaignScopeKey) return;
      const targetCampaign = campaigns.find((campaign) => campaign.scopeKey === campaignScopeKey);
      if (!targetCampaign) return;

      if (targetCampaign.persisted) {
        const nextSelection: CampaignSelection = {
          slug: targetCampaign.slug,
          guildId: targetCampaign.guildId,
        };
        writePersistedCampaignSelection(nextSelection);
        setPersistedSelection(nextSelection);
      } else {
        writePersistedCampaignSelection(null);
        setPersistedSelection(null);
      }

      const nextPath = resolveCampaignTargetPath({
        routeType: route.routeType,
        campaignSlug: targetCampaign.slug,
        guildId: targetCampaign.guildId,
      });
      router.push(nextPath);
    },
    [campaigns, route.routeType, router]
  );

  return (
    <CampaignContextProvider
      value={{
        activeCampaignSlug,
        activeGuildId,
        activeScopeKey,
        isDemoCampaign,
        route,
        campaigns,
        realCampaigns,
        selectCampaign,
      }}
    >
      {children}
    </CampaignContextProvider>
  );
}
