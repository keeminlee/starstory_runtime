import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ campaignSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Legacy route — redirects to the unified campaign page.
 * Preserves guild_id and show_archived params.
 */
export default async function CampaignSessionsPage({ params, searchParams }: PageProps) {
  const { campaignSlug } = await params;
  const query = await searchParams;
  const outParams = new URLSearchParams();

  const guildId = Array.isArray(query.guild_id) ? query.guild_id[0] : query.guild_id;
  if (guildId) outParams.set("guild_id", guildId);

  const showArchived = Array.isArray(query.show_archived) ? query.show_archived[0] : query.show_archived;
  if (showArchived) outParams.set("show_archived", showArchived);

  const suffix = outParams.toString();
  redirect(`/campaigns/${campaignSlug}${suffix ? `?${suffix}` : ""}`);
}
