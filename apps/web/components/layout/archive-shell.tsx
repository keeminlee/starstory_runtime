import type { ReactNode } from "react";
import { AppFloatingRail } from "@/components/layout/app-floating-rail";
import { AppShellControls } from "@/components/layout/app-shell-controls";

type ArchiveShellProps = {
  section: string;
  campaignName?: string;
  showTopControls?: boolean;
  showCampaignSelector?: boolean;
  /** Override the default max-width class on the content wrapper. */
  contentClassName?: string;
  children: ReactNode;
};

export function ArchiveShell({ section, campaignName, showTopControls = true, showCampaignSelector = true, contentClassName, children }: ArchiveShellProps) {
  return (
    <div className="archive-shell-root flex min-h-screen text-foreground">
      <AppFloatingRail />
      <main className="relative flex min-h-screen flex-1 flex-col overflow-hidden">
        {showTopControls ? (
          <AppShellControls section={section} campaignName={campaignName} showCampaignSelector={showCampaignSelector} />
        ) : null}
        <div className={contentClassName ?? "archive-shell-transition-target custom-scrollbar mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-8 pb-8 pt-24 sm:px-10 lg:px-12"}>
          {children}
        </div>
      </main>
    </div>
  );
}
