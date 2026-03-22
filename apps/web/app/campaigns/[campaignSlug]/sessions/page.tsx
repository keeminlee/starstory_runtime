import { notFound } from "next/navigation";
import { CampaignOverview } from "@/components/campaign/campaign-overview";
import { ArchiveShell } from "@/components/layout/archive-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { WebApiError } from "@/lib/api/http";
import { getCampaignSessionsApi } from "@/lib/api/campaigns";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ campaignSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CampaignSessionsPage({ params, searchParams }: PageProps) {
  const { campaignSlug } = await params;
  const query = await searchParams;
  const showArchived = (() => {
    const raw = query.show_archived;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  })();
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
      <ArchiveShell section="Sessions" showCampaignSelector={false}>
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

  return (
    <ArchiveShell section="Sessions" campaignName={campaign.name} showCampaignSelector={false}>
      <CampaignOverview campaign={campaign} searchParams={query} showArchived={showArchived} />
    </ArchiveShell>
  );
}
