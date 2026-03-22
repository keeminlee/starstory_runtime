import { notFound } from "next/navigation";
import { ArchiveShell } from "@/components/layout/archive-shell";
import { CampaignPage } from "@/components/campaign/campaign-page";
import { EmptyState } from "@/components/shared/empty-state";
import { WebApiError } from "@/lib/api/http";
import { getCampaignSessionsApi } from "@/lib/api/campaigns";
import { getCampaignRegistryApi, getCampaignSeenDiscordUsersApi } from "@/lib/api/registry";
import type { RegistrySnapshotDto, SeenDiscordUserOption } from "@/lib/registry/types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ campaignSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UnifiedCampaignPage({ params, searchParams }: PageProps) {
  const { campaignSlug } = await params;
  const query = await searchParams;

  const viewParam = (() => {
    const raw = query.view;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" ? value.trim().toLowerCase() : null;
  })();

  const showArchived = (() => {
    const raw = query.show_archived;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  })();

  const initialView: "chronicle" | "compendium" = viewParam === "compendium" ? "compendium" : "chronicle";

  const initialSessionId = (() => {
    const raw = query.session;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  })();

  /* ── Campaign + sessions ── */
  let campaign = null as Awaited<ReturnType<typeof getCampaignSessionsApi>>["campaign"] | null;
  let routeAmbiguous = false;

  try {
    const response = await getCampaignSessionsApi(campaignSlug, query);
    campaign = response.campaign;
  } catch (error) {
    if (error instanceof WebApiError && error.status === 404) {
      campaign = null;
    } else if (error instanceof WebApiError && error.status === 409 && error.code === "ambiguous_campaign_scope") {
      routeAmbiguous = true;
    } else {
      throw error;
    }
  }

  if (routeAmbiguous) {
    return (
      <ArchiveShell section="Campaign" showCampaignSelector={false}>
        <EmptyState
          title="Choose guild context"
          description="This campaign slug exists in multiple authorized guilds. Open it from Dashboard so the app can pass an explicit guild scope."
        />
      </ArchiveShell>
    );
  }

  if (!campaign) {
    notFound();
  }

  /* ── Registry (eagerly loaded for instant compendium tab) ── */
  let registry: RegistrySnapshotDto | null = null;
  let seenDiscordUsers: SeenDiscordUserOption[] = [];

  try {
    const registryResponse = await getCampaignRegistryApi(campaignSlug, query);
    registry = registryResponse.registry;
  } catch (error) {
    if (error instanceof WebApiError && error.status === 404) {
      registry = null;
    } else {
      throw error;
    }
  }

  if (registry) {
    try {
      seenDiscordUsers = (await getCampaignSeenDiscordUsersApi(campaignSlug, query)).users;
    } catch {
      seenDiscordUsers = [];
    }
  }

  return (
    <ArchiveShell section="Campaign" campaignName={campaign.name} showCampaignSelector={false}>
      <CampaignPage
        campaign={campaign}
        searchParams={query}
        showArchived={showArchived}
        initialView={initialView}
        initialSessionId={initialSessionId}
        registry={registry}
        seenDiscordUsers={seenDiscordUsers}
      />
    </ArchiveShell>
  );
}
