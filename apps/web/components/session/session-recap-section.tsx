"use client";

import { useState } from "react";
import { EntityResolutionPanel } from "@/components/session/entity-resolution-panel";
import { RecapTabs } from "@/components/session/recap-tabs";
import type { SessionArtifactStatus, SessionRecap, SessionRecapPhase, SessionSpeakerAttributionState } from "@/lib/types";

type Props = {
  recap: SessionRecap | null;
  recapPhase: SessionRecapPhase;
  sessionId: string;
  sessionTitle: string;
  campaignSlug: string;
  speakerAttribution: SessionSpeakerAttributionState | null;
  searchParams?: Record<string, string | string[] | undefined>;
  canRegenerate: boolean;
  canWrite: boolean;
  showRegenerateUnavailableBanner: boolean;
  status: SessionArtifactStatus;
  emptyDescription: string;
  warnings: string[];
};

export function SessionRecapSection({
  recap,
  recapPhase,
  sessionId,
  sessionTitle,
  campaignSlug,
  speakerAttribution,
  searchParams,
  canRegenerate,
  canWrite,
  showRegenerateUnavailableBanner,
  status,
  emptyDescription,
  warnings,
}: Props) {
  const [annotationVersion, setAnnotationVersion] = useState(0);

  return (
    <div className="space-y-4">
      <EntityResolutionPanel
        sessionId={sessionId}
        campaignSlug={campaignSlug}
        searchParams={searchParams}
        canWrite={canWrite}
        onResolutionChange={() => setAnnotationVersion((current) => current + 1)}
      />
      <RecapTabs
        recap={recap}
        recapPhase={recapPhase}
        sessionId={sessionId}
        sessionTitle={sessionTitle}
        campaignSlug={campaignSlug}
        speakerAttribution={speakerAttribution}
        searchParams={searchParams}
        canRegenerate={canRegenerate}
        canWrite={canWrite}
        showRegenerateUnavailableBanner={showRegenerateUnavailableBanner}
        status={status}
        emptyDescription={emptyDescription}
        warnings={warnings}
        annotationVersion={annotationVersion}
      />
    </div>
  );
}