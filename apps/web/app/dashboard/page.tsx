import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArchiveShell } from "@/components/layout/archive-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { STARSTORY_DISCORD_INSTALL_URL } from "@/lib/auth/primaryAuth";
import { SITE_TITLE } from "@/lib/siteMetadata";
import { getWebDashboardModel } from "@/lib/server/campaignReaders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: `Campaigns | ${SITE_TITLE}`,
  alternates: {
    canonical: "/dashboard",
  },
  openGraph: {
    title: `Campaigns | ${SITE_TITLE}`,
    url: "/dashboard",
  },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildCampaignHref(campaign: {
  slug: string;
  guildId: string | null;
}): string {
  const query = campaign.guildId ? `?guild_id=${encodeURIComponent(campaign.guildId)}` : "";
  return `/campaigns/${campaign.slug}${query}`;
}

/**
 * Dashboard is now a redirect-only router.
 * - Single-campaign users → redirect to their campaign page.
 * - Multi-campaign users → redirect to first real campaign page.
 * - Edge cases (no guilds, no campaigns) → show empty state.
 */
export default async function DashboardPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const model = await getWebDashboardModel({ searchParams: query });

  if (model.authState === "unsigned") {
    redirect("/");
  }

  const realCampaigns = model.campaigns.filter((campaign) => campaign.type !== "system");

  if (realCampaigns.length >= 1) {
    redirect(buildCampaignHref(realCampaigns[0]));
  }

  if (model.authState === "signed_in_no_authorized_guilds" || model.authState === "signed_in_no_meepo_installed") {
    return (
      <ArchiveShell section="Campaigns">
        <EmptyState
          title="Add Starstory to a Discord server"
          description="Add Starstory to a Discord server to begin capturing sessions."
          actionLabel="Invite Starstory"
          actionHref={STARSTORY_DISCORD_INSTALL_URL}
        />
      </ArchiveShell>
    );
  }

  return (
    <ArchiveShell section="Campaigns">
      <EmptyState
        title="No campaigns yet"
        description="Start a session in Discord to create your first campaign."
        actionLabel="Invite Discord Bot"
        actionHref={STARSTORY_DISCORD_INSTALL_URL}
      />
    </ArchiveShell>
  );
}
