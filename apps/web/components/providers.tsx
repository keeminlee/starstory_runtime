"use client";

import { Suspense, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { AmbientPreferencesProvider } from "@/providers/preferences-provider";
import { VerboseModeProvider } from "@/providers/verbose-mode-provider";
import { ActiveCampaignGate } from "@/components/guards/active-campaign-gate";
import { CampaignContextProvider } from "@/components/providers/campaign-context-provider";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  const suspenseFallback = (
    <CampaignContextProvider
      value={{
        activeCampaignSlug: null,
        activeGuildId: null,
        activeScopeKey: null,
        isDemoCampaign: false,
        route: { routeType: "other", routeCampaignSlug: null, routeGuildId: null },
        campaigns: [],
        realCampaigns: [],
        selectCampaign: () => {},
      }}
    >
      <AmbientPreferencesProvider>
        <VerboseModeProvider>{children}</VerboseModeProvider>
      </AmbientPreferencesProvider>
    </CampaignContextProvider>
  );

  return (
    <SessionProvider>
      <Suspense fallback={suspenseFallback}>
        <ActiveCampaignGate>
          <AmbientPreferencesProvider>
            <VerboseModeProvider>{children}</VerboseModeProvider>
          </AmbientPreferencesProvider>
        </ActiveCampaignGate>
      </Suspense>
    </SessionProvider>
  );
}
