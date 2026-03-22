"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CampaignHeader } from "@/components/campaign/campaign-header";
import { CampaignModeToggle } from "@/components/campaign/campaign-mode-toggle";
import type { CampaignView } from "@/components/campaign/campaign-mode-toggle";
import { CompendiumSurface } from "@/components/campaign/compendium-surface";
import { ChronicleSurface } from "@/components/chronicle/chronicle-surface";
import { CampaignSessionConstellation } from "@/components/chronicle/campaign-session-constellation";
import { useSessionConstellationModel } from "@/components/chronicle/use-session-rail-model";
import { archiveSessionApi, unarchiveSessionApi } from "@/lib/api/sessions";
import { updateSessionOrderApi } from "@/lib/api/campaigns";
import type { CampaignSummary } from "@/lib/types";
import type { RegistrySnapshotDto, SeenDiscordUserOption } from "@/lib/registry/types";

export type { CampaignView };

type CampaignPageProps = {
  campaign: CampaignSummary;
  searchParams: Record<string, string | string[] | undefined>;
  showArchived: boolean;
  initialView: CampaignView;
  initialSessionId: string | null;
  registry: RegistrySnapshotDto | null;
  seenDiscordUsers: SeenDiscordUserOption[];
};

export function CampaignPage({
  campaign,
  searchParams,
  showArchived,
  initialView,
  initialSessionId,
  registry,
  seenDiscordUsers,
}: CampaignPageProps) {
  const pathname = usePathname();
  const router = useRouter();

  /* ── Campaign header state ── */
  const [campaignName, setCampaignName] = useState(campaign.name);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<CampaignView>(initialView);

  useEffect(() => {
    setCampaignName(campaign.name);
  }, [campaign.name]);

  const scopedSearchParams = useMemo(
    () => ({
      ...(searchParams ?? {}),
      ...(campaign.guildId ? { guild_id: campaign.guildId } : {}),
    }),
    [campaign.guildId, searchParams],
  );

  /* ── Persistence callbacks ── */
  const handleReorder = useCallback(
    (orderedIds: string[]) => {
      updateSessionOrderApi(campaign.slug, orderedIds, scopedSearchParams).catch(() => {
        // Reorder persisted optimistically; swallow network errors.
      });
    },
    [campaign.slug, scopedSearchParams],
  );

  const handleArchive = useCallback(
    (sessionId: string) => {
      archiveSessionApi(sessionId, scopedSearchParams)
        .then(() => router.refresh())
        .catch(() => {});
    },
    [scopedSearchParams, router],
  );

  const handleUnarchive = useCallback(
    (sessionId: string) => {
      unarchiveSessionApi(sessionId, scopedSearchParams)
        .then(() => router.refresh())
        .catch(() => {});
    },
    [scopedSearchParams, router],
  );

  /* ── Session constellation model (shell-level, persists across modes) ── */
  const constellation = useSessionConstellationModel({
    sessions: campaign.sessions,
    showArchived,
    initialSelectedId: initialSessionId,
    onReorder: handleReorder,
    onArchive: handleArchive,
    onUnarchive: handleUnarchive,
  });

  const archivedSessionCount =
    campaign.archivedSessionCount ??
    campaign.sessions.filter((s) => s.isArchived).length;

  const selectedSession = useMemo(
    () =>
      campaign.sessions.find((session) => session.id === constellation.selectedSessionId) ??
      null,
    [campaign.sessions, constellation.selectedSessionId],
  );

  /* ── Archive toggle URL sync ── */
  function handleToggleArchived(): void {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (value === undefined || key === "show_archived") continue;
      if (Array.isArray(value)) {
        for (const entry of value) params.append(key, entry);
      } else {
        params.set(key, value);
      }
    }
    if (campaign.guildId) params.set("guild_id", campaign.guildId);
    if (!showArchived) params.set("show_archived", "1");
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  /* ── Session selection URL sync ── */
  function handleSelectSession(id: string): void {
    constellation.selectSession(id);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (value === undefined || key === "session") continue;
      if (Array.isArray(value)) {
        for (const entry of value) params.append(key, entry);
      } else {
        params.set(key, value);
      }
    }
    if (campaign.guildId) params.set("guild_id", campaign.guildId);
    params.set("session", id);
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  /* ── View toggle with URL sync ── */
  function switchView(next: CampaignView): void {
    setActiveView(next);

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (value === undefined || key === "view") continue;
      if (Array.isArray(value)) {
        for (const entry of value) params.append(key, entry);
      } else {
        params.set(key, value);
      }
    }
    if (campaign.guildId) {
      params.set("guild_id", campaign.guildId);
    }
    if (next === "compendium") {
      params.set("view", "compendium");
    }
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <>
      {/* ── Fixed constellation — viewport-anchored, scrolls independently ── */}
      <div className="fixed left-[80px] top-24 bottom-0 z-20 w-[300px] overflow-y-auto custom-scrollbar">
        <CampaignSessionConstellation
          nodes={constellation.nodes}
          previewNodes={constellation.previewNodes}
          selectedSessionId={constellation.selectedSessionId}
          hoveredSessionId={constellation.hoveredSessionId}
          onSelect={handleSelectSession}
          onHoverEnter={constellation.setHoveredSessionId}
          onHoverLeave={() => constellation.setHoveredSessionId(null)}
          showArchived={showArchived}
          onToggleArchived={handleToggleArchived}
          hasArchivedSessions={constellation.hasArchivedSessions}
          archivedSessionCount={archivedSessionCount}
          archivedSessions={constellation.archivedSessions}
          isEditMode={constellation.isEditMode}
          onToggleEditMode={constellation.toggleEditMode}
          dragState={constellation.dragState}
          onDragStart={constellation.startDrag}
          onDragMove={constellation.updateDrag}
          onDragEnd={constellation.endDrag}
          onDragCancel={constellation.cancelDrag}
        />
      </div>

      {/* ── Scrolling main content — shifted right to clear fixed constellation ── */}
      <div className="ml-[316px] max-w-5xl space-y-8 pr-4">
        {/* ── Campaign identity + mode toggle ── */}
        <div>
          <CampaignHeader
            campaign={campaign}
            campaignName={campaignName}
            onNameSaved={setCampaignName}
            scopedSearchParams={scopedSearchParams}
            headerError={headerError}
          />
          <CampaignModeToggle activeView={activeView} onSwitch={switchView} />
        </div>

        {/* ── Active surface ── */}
        {activeView === "chronicle" ? (
          <ChronicleSurface
            selectedSessionId={constellation.selectedSessionId}
            selectedSession={selectedSession}
            campaignSlug={campaign.slug}
            guildId={campaign.guildId}
            canEditSessionTitle={Boolean(campaign.canWrite)}
          />
        ) : (
          <CompendiumSurface
            campaign={campaign}
            registry={registry}
            seenDiscordUsers={seenDiscordUsers}
            searchParams={searchParams}
          />
        )}
      </div>
    </>
  );
}
