"use client";

import { useMemo } from "react";
import { useCampaignContext } from "@/components/providers/campaign-context-provider";

export function CampaignSelector() {
  const { activeScopeKey, campaigns, realCampaigns, selectCampaign } = useCampaignContext();

  const currentValue = useMemo(() => {
    if (activeScopeKey && campaigns.some((campaign) => campaign.scopeKey === activeScopeKey)) {
      return activeScopeKey;
    }
    return "";
  }, [activeScopeKey, campaigns]);

  const hasRealCampaigns = realCampaigns.length > 0;
  const disabled = campaigns.length === 0;

  return (
    <label className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
      <span>Campaign</span>
      <select
        aria-label="Select campaign"
        value={currentValue}
        disabled={disabled}
        onChange={(event) => {
          const nextCampaignScopeKey = event.currentTarget.value;
          if (!nextCampaignScopeKey) return;
          if (nextCampaignScopeKey === "__new__") return;
          selectCampaign(nextCampaignScopeKey);
        }}
        className="control-select min-w-48 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
      >
        <option value="">{campaigns.length === 0 ? "No campaigns" : "Select campaign"}</option>
        {campaigns.map((campaign) => (
          <option key={campaign.scopeKey} value={campaign.scopeKey}>
            {campaign.type === "system" ? campaign.name : `${campaign.name} · ${campaign.guildName}`}
          </option>
        ))}
        {hasRealCampaigns ? <option value="__new__">+ New Campaign</option> : null}
      </select>
    </label>
  );
}
