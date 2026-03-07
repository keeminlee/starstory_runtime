import { notFound } from "next/navigation";
import { CampaignOverview } from "@/components/campaign/campaign-overview";
import { ArchiveShell } from "@/components/layout/archive-shell";
import { WebApiError } from "@/lib/api/http";
import { getCampaignSessionsApi } from "@/lib/api/campaigns";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ campaignSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CampaignPage({ params, searchParams }: PageProps) {
  const { campaignSlug } = await params;
  const query = await searchParams;
  let campaign = null as Awaited<ReturnType<typeof getCampaignSessionsApi>>["campaign"] | null;

  try {
    const response = await getCampaignSessionsApi(campaignSlug, query);
    campaign = response.campaign;
  } catch (error) {
    if (error instanceof WebApiError && error.status === 404) {
      campaign = null;
    } else {
      throw error;
    }
  }

  if (!campaign) {
    notFound();
  }

  return (
    <ArchiveShell section="Campaign" activePath="/campaigns" campaignName={campaign.name}>
      <CampaignOverview campaign={campaign} />
    </ArchiveShell>
  );
}
