"use client";

import { ChronicleRecapPane } from "@/components/chronicle/chronicle-recap-pane";
import type { RegistrySnapshotDto } from "@/lib/registry/types";
import type { SessionSummary } from "@/lib/types";

type ChronicleSurfaceProps = {
  selectedSessionId: string | null;
  selectedSession: SessionSummary | null;
  campaignSlug: string;
  guildId: string | null;
  canEditSessionTitle: boolean;
  canWrite: boolean;
  searchParams: Record<string, string | string[] | undefined>;
  registry: RegistrySnapshotDto | null;
};

export function ChronicleSurface({
  selectedSessionId,
  selectedSession,
  campaignSlug,
  guildId,
  canEditSessionTitle,
  canWrite,
  searchParams,
  registry,
}: ChronicleSurfaceProps) {
  return (
    <ChronicleRecapPane
      selectedSessionId={selectedSessionId}
      selectedSession={selectedSession}
      campaignSlug={campaignSlug}
      guildId={guildId}
      canEditSessionTitle={canEditSessionTitle}
      canWrite={canWrite}
      searchParams={searchParams}
      registry={registry}
    />
  );
}
