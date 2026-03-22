import type { Metadata } from "next";
import Link from "next/link";
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

function buildCampaignSessionsHref(campaign: {
  slug: string;
  guildId: string | null;
}): string {
  const query = campaign.guildId ? `?guild_id=${encodeURIComponent(campaign.guildId)}` : "";
  return `/campaigns/${campaign.slug}/sessions${query}`;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const model = await getWebDashboardModel({ searchParams: query });

  if (model.authState === "unsigned") {
    redirect("/");
  }

  const realCampaigns = model.campaigns.filter((campaign) => campaign.type !== "system");

  if (realCampaigns.length === 1) {
    redirect(buildCampaignSessionsHref(realCampaigns[0]));
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

  if (model.authState === "signed_in_no_sessions" || realCampaigns.length === 0) {
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

  return (
    <ArchiveShell section="Campaigns">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="font-heading text-4xl tracking-tight">Campaigns</h1>
          <p className="font-body-serif text-base text-muted-foreground">
            Choose a campaign and go straight to the chronicle.
          </p>
        </div>

        <div className="grid gap-4">
          {realCampaigns.map((campaign) => (
            <Link
              key={`${campaign.slug}::${campaign.guildId ?? ""}`}
              href={buildCampaignSessionsHref(campaign)}
              className="rounded-2xl border border-border/60 bg-background/55 px-6 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] transition-colors hover:border-primary/30 hover:bg-background/75"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    {campaign.guildIconUrl ? (
                      <img
                        src={campaign.guildIconUrl}
                        alt={`${campaign.guildName} icon`}
                        className="h-10 w-10 rounded-full border border-border/60 object-cover"
                        loading="lazy"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <h2 className="font-heading truncate text-2xl">{campaign.name}</h2>
                      <p className="font-body-serif text-sm text-muted-foreground">{campaign.guildName}</p>
                    </div>
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <div>{campaign.sessionCount} sessions</div>
                  <div>Last session {campaign.lastSessionDate ?? "n/a"}</div>
                </div>
              </div>
            </Link>
          ))}
          {model.emptyGuilds.map((guild) => (
            <div key={`empty-${guild.guildId}`} className="rounded-2xl border border-dashed border-border/50 px-6 py-5 text-sm text-muted-foreground">
              <span className="font-heading text-foreground">{guild.guildName}</span>
              <span> has no campaign yet.</span>
            </div>
          ))}
        </div>
      </div>
    </ArchiveShell>
  );
}
