"use client";

import { useMemo } from "react";
import { useCampaignContext } from "@/components/providers/campaign-context-provider";

export function CampaignSelector() {
  const { activeScopeKey, campaigns, realCampaigns, selectCampaign } = useCampaignContext();

  const currentValue = useMemo(() => {
    if (activeScopeKey && campaigns.some((campaign) => campaign.scopeKey === activeScopeKey)) {
      return activeScopeKey;
    }
    return campaigns[0]?.scopeKey ?? "";
  }, [activeScopeKey, campaigns]);

  const hasRealCampaigns = realCampaigns.length > 0;

  if (!hasRealCampaigns) {
    return (
      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span>Campaign</span>
        <span className="text-[11px] normal-case tracking-normal text-muted-foreground/90">
          Start a session from Discord to surface a campaign here.
        </span>
      </div>
    );
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
      <span>Campaign</span>
      <select
        aria-label="Switch campaign"
        value={currentValue}
        onChange={(event) => {
          const nextCampaignScopeKey = event.currentTarget.value;
          selectCampaign(nextCampaignScopeKey);
        }}
        className="control-select min-w-48 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
      >
        {campaigns.map((campaign) => (
          <option key={campaign.scopeKey} value={campaign.scopeKey}>
            {campaign.type === "system" ? campaign.name : `${campaign.name} · ${campaign.guildName}`}
          </option>
        ))}
      </select>
    </label>
  );
}
