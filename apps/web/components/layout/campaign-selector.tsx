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
  const shouldShowSelector = realCampaigns.length > 1;

  if (!hasRealCampaigns || !shouldShowSelector) {
    return null;
  }

  return (
    <label className="inline-flex items-center">
      <select
        aria-label="Switch campaign"
        value={currentValue}
        onChange={(event) => {
          const nextCampaignScopeKey = event.currentTarget.value;
          selectCampaign(nextCampaignScopeKey);
        }}
        className="control-select min-w-44 rounded-full px-3 py-2 text-xs font-semibold tracking-wide"
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
