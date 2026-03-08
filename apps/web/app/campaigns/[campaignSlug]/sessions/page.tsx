import { notFound } from "next/navigation";
import Link from "next/link";
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
      <ArchiveShell section="Sessions">
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
    <ArchiveShell section="Sessions" campaignName={campaign.name}>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Link
            href={{
              pathname: `/campaigns/${campaign.slug}/compendium`,
              ...(campaign.guildId ? { query: { guild_id: campaign.guildId } } : {}),
            }}
            className="rounded-full border border-border bg-background/35 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:bg-background/55"
          >
            Open Compendium
          </Link>
        </div>
        <CampaignOverview campaign={campaign} searchParams={query} />
      </div>
    </ArchiveShell>
  );
}
