"use client";

import { UserCircle2 } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { AccountControl } from "@/components/layout/account-control";
import { CampaignSelector } from "@/components/layout/campaign-selector";

type AppShellControlsProps = {
  section: string;
  campaignName?: string;
  showCampaignSelector?: boolean;
};

export function AppShellControls({ section, campaignName, showCampaignSelector = true }: AppShellControlsProps) {
  const { data: session, status } = useSession();
  const displayName = session?.user?.globalName ?? session?.user?.name ?? "Discord user";
  const avatarUrl = session?.user?.image ?? null;

  return (
    <div className="pointer-events-none fixed right-6 top-6 z-30 flex items-start gap-3">
      <div className={`pointer-events-auto hidden md:block ${showCampaignSelector ? "" : "invisible w-0 overflow-hidden"}`}>
        <CampaignSelector />
      </div>

      <div className="pointer-events-auto relative">
        {status !== "authenticated" ? (
          <button
            type="button"
            onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
            className="group flex h-11 w-11 items-center justify-end overflow-hidden rounded-full border border-border/70 bg-background/82 px-3 text-muted-foreground shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur transition-[width,color] duration-200 hover:w-32 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-label="Sign in"
            title="Sign in"
          >
            <span className="max-w-0 overflow-hidden whitespace-nowrap pr-0 text-sm opacity-0 transition-all duration-200 group-hover:max-w-20 group-hover:pr-2 group-hover:opacity-100">
              Sign in
            </span>
            <UserCircle2 className="h-6 w-6" />
          </button>
        ) : (
          <AccountControl displayName={displayName} avatarUrl={avatarUrl} />
        )}
      </div>
    </div>
  );
}