import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ campaignSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Legacy route — redirects to the unified campaign page with compendium view.
 * Preserves guild_id param.
 */
export default async function CampaignCompendiumPage({ params, searchParams }: PageProps) {
  const { campaignSlug } = await params;
  const query = await searchParams;
  const outParams = new URLSearchParams();

  outParams.set("view", "compendium");

  const guildId = Array.isArray(query.guild_id) ? query.guild_id[0] : query.guild_id;
  if (guildId) outParams.set("guild_id", guildId);

  redirect(`/campaigns/${campaignSlug}?${outParams.toString()}`);
}
