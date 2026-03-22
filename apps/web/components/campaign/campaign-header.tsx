"use client";

import { useRouter } from "next/navigation";
import { CampaignHeaderSwitcher } from "@/components/campaign/campaign-header-switcher";
import { InlineEditableText } from "@/components/shared/inline-editable-text";
import { useVerboseMode } from "@/providers/verbose-mode-provider";
import type { CampaignSummary } from "@/lib/types";
import { updateCampaignNameApi } from "@/lib/api/campaigns";
import { WebApiError } from "@/lib/api/http";

type CampaignHeaderProps = {
  campaign: CampaignSummary;
  campaignName: string;
  onNameSaved: (name: string) => void;
  scopedSearchParams: Record<string, string | string[] | undefined>;
  headerError: string | null;
};

export function CampaignHeader({
  campaign,
  campaignName,
  onNameSaved,
  scopedSearchParams,
  headerError,
}: CampaignHeaderProps) {
  const router = useRouter();
  const { verboseModeEnabled } = useVerboseMode();

  return (
    <header>
      <div className="flex flex-wrap items-center gap-3">
        <InlineEditableText
          value={campaignName}
          canEdit={Boolean(campaign.canWrite)}
          ariaLabel="Campaign title"
          maxLength={100}
          emptyValueMessage="Campaign name cannot be empty."
          maxLengthMessage="Campaign name must be 100 characters or fewer."
          inputClassName="min-w-[16rem] border-b border-primary/30 bg-transparent px-0 py-0 text-4xl font-serif text-foreground outline-none transition-colors focus:border-primary"
          onSave={async (nextName) => {
            try {
              const result = await updateCampaignNameApi(campaign.slug, { campaignName: nextName }, scopedSearchParams);
              onNameSaved(result.campaign.name);
              router.refresh();
              return result.campaign.name;
            } catch (error) {
              if (error instanceof WebApiError) {
                throw new Error(error.message);
              }
              throw new Error("Unable to rename campaign right now.");
            }
          }}
          renderDisplay={({ displayValue, canEdit, isSaving, startEditing }) => (
            <h1 className="text-4xl font-serif">
              {canEdit ? (
                <button
                  type="button"
                  onClick={startEditing}
                  disabled={isSaving}
                  className="cursor-text text-left text-foreground decoration-primary/40 underline-offset-4 transition hover:text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {displayValue}
                </button>
              ) : (
                displayValue
              )}
            </h1>
          )}
        />
        <CampaignHeaderSwitcher />
      </div>
      {verboseModeEnabled ? (
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">{campaign.slug}</p>
      ) : null}
      <p className="mt-2 max-w-3xl text-muted-foreground">{campaign.description}</p>
      {headerError ? <p className="mt-2 text-sm text-rose-400">{headerError}</p> : null}
    </header>
  );
}
