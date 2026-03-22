"use client";

import { ChronicleRecapPane } from "@/components/chronicle/chronicle-recap-pane";
import type { SessionSummary } from "@/lib/types";

type ChronicleSurfaceProps = {
  selectedSessionId: string | null;
  selectedSession: SessionSummary | null;
  campaignSlug: string;
  guildId: string | null;
  canEditSessionTitle: boolean;
};

export function ChronicleSurface({
  selectedSessionId,
  selectedSession,
  campaignSlug,
  guildId,
  canEditSessionTitle,
}: ChronicleSurfaceProps) {
  return (
    <ChronicleRecapPane
      selectedSessionId={selectedSessionId}
      selectedSession={selectedSession}
      campaignSlug={campaignSlug}
      guildId={guildId}
      canEditSessionTitle={canEditSessionTitle}
    />
  );
}
