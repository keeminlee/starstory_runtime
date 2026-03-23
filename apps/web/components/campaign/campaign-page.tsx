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
  const [sessionArchiveOverrides, setSessionArchiveOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCampaignName(campaign.name);
  }, [campaign.name]);

  useEffect(() => {
    setSessionArchiveOverrides((prev) => {
      let changed = false;
      const serverState = new Map(campaign.sessions.map((session) => [session.id, session.isArchived]));
      const next: Record<string, boolean> = {};

      for (const [sessionId, isArchived] of Object.entries(prev)) {
        const serverArchived = serverState.get(sessionId);
        if (serverArchived === undefined) {
          changed = true;
          continue;
        }
        if (serverArchived === isArchived) {
          changed = true;
          continue;
        }
        next[sessionId] = isArchived;
      }

      return changed ? next : prev;
    });
  }, [campaign.sessions]);

  const effectiveSessions = useMemo(
    () =>
      campaign.sessions.map((session) => {
        const isArchived = sessionArchiveOverrides[session.id];
        return isArchived === undefined ? session : { ...session, isArchived };
      }),
    [campaign.sessions, sessionArchiveOverrides],
  );

  const isDemoMode = campaign.readOnlyReason === "demo_mode";

  const setOptimisticArchiveState = useCallback(
    (sessionId: string, isArchived: boolean) => {
      setSessionArchiveOverrides((prev) => ({ ...prev, [sessionId]: isArchived }));
    },
    [],
  );

  const rollbackArchiveState = useCallback(
    (sessionId: string) => {
      const serverSession = campaign.sessions.find((session) => session.id === sessionId);
      if (!serverSession) {
        setSessionArchiveOverrides((prev) => {
          if (!(sessionId in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
        return;
      }

      setSessionArchiveOverrides((prev) => {
        if (prev[sessionId] === serverSession.isArchived) {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        }
        return { ...prev, [sessionId]: serverSession.isArchived };
      });
    },
    [campaign.sessions],
  );

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
      setOptimisticArchiveState(sessionId, true);
      if (isDemoMode) {
        return;
      }
      archiveSessionApi(sessionId, scopedSearchParams)
        .then(() => router.refresh())
        .catch(() => rollbackArchiveState(sessionId));
    },
    [isDemoMode, rollbackArchiveState, scopedSearchParams, router, setOptimisticArchiveState],
  );

  const handleUnarchive = useCallback(
    (sessionId: string) => {
      setOptimisticArchiveState(sessionId, false);
      if (isDemoMode) {
        return;
      }
      unarchiveSessionApi(sessionId, scopedSearchParams)
        .then(() => router.refresh())
        .catch(() => rollbackArchiveState(sessionId));
    },
    [isDemoMode, rollbackArchiveState, scopedSearchParams, router, setOptimisticArchiveState],
  );

  /* ── Session constellation model (shell-level, persists across modes) ── */
  const constellation = useSessionConstellationModel({
    sessions: effectiveSessions,
    showArchived,
    initialSelectedId: initialSessionId,
    onReorder: handleReorder,
    onArchive: handleArchive,
    onUnarchive: handleUnarchive,
  });

  const archivedSessionCount =
    campaign.archivedSessionCount ??
    effectiveSessions.filter((s) => s.isArchived).length;

  const selectedSession = useMemo(
    () =>
      effectiveSessions.find((session) => session.id === constellation.selectedSessionId) ??
      null,
    [effectiveSessions, constellation.selectedSessionId],
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
      <div className="fixed left-[80px] top-28 bottom-0 z-20 w-[340px] overflow-y-auto custom-scrollbar">
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
      <div className="ml-[356px] pr-4" style={{ width: "calc(100% - 356px)" }}>
        <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6 lg:px-8">
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
              canWrite={Boolean(campaign.canWrite)}
              searchParams={searchParams}
              registry={registry}
            />
          ) : (
            <CompendiumSurface
              campaign={campaign}
              registry={registry}
              seenDiscordUsers={seenDiscordUsers}
              searchParams={searchParams}
              selectedSessionId={constellation.selectedSessionId}
            />
          )}
        </div>
      </div>
    </>
  );
}
