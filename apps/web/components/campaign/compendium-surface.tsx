"use client";

import { CampaignRegistryManager } from "@/components/campaign/campaign-registry-manager";
import type { CampaignSummary } from "@/lib/types";
import type { RegistrySnapshotDto, SeenDiscordUserOption } from "@/lib/registry/types";

type CompendiumSurfaceProps = {
  campaign: CampaignSummary;
  registry: RegistrySnapshotDto | null;
  seenDiscordUsers: SeenDiscordUserOption[];
  searchParams: Record<string, string | string[] | undefined>;
};

export function CompendiumSurface({
  campaign,
  registry,
  seenDiscordUsers,
  searchParams,
}: CompendiumSurfaceProps) {
  const isEditable = campaign.editable !== false && Boolean(campaign.canWrite);

  if (!registry) {
    return (
      <p className="text-center text-muted-foreground py-12">
        Compendium is not available for this campaign.
      </p>
    );
  }

  return (
    <CampaignRegistryManager
      campaignSlug={campaign.slug}
      guildId={campaign.guildId}
      initialRegistry={registry}
      initialSeenDiscordUsers={seenDiscordUsers}
      searchParams={searchParams}
      isEditable={isEditable}
      readOnlyReason={campaign.readOnlyReason}
    />
  );
}
