"use client";

import { useCallback, useMemo, useState } from "react";
import type { SessionSummary } from "@/lib/types";

/* ── Prominence tiers (visual weight) ── */
export type ConstellationProminence = "anchor" | "major" | "minor";

/* ── Positioned node for rendering ── */
export type ConstellationNode = {
  session: SessionSummary;
  prominence: ConstellationProminence;
  /** X offset in px from the column centre (zig-zag stagger). */
  xOffset: number;
  /** Y position in px from the top of the constellation area. */
  y: number;
};

/* ── Input / output ── */
type UseSessionConstellationModelInput = {
  sessions: SessionSummary[];
  showArchived: boolean;
  initialSelectedId?: string | null;
  /**
   * Optional persistence callback — called after a reorder mutation with the
   * new ordered id list. Wiring a server call here requires no structural
   * change to the hook or the constellation components.
   */
  onReorder?: (orderedIds: string[]) => void;
};

type UseSessionConstellationModelOutput = {
  /** Positioned nodes ready for rendering. */
  nodes: ConstellationNode[];
  /** Underlying ordered sessions (same order as nodes). */
  orderedSessions: SessionSummary[];
  /** Explicit ordered id list — drag-reorder mutates this. */
  orderedIds: string[];
  /** Currently selected session id — local state is authoritative. */
  selectedSessionId: string | null;
  selectSession: (id: string) => void;
  hoveredSessionId: string | null;
  setHoveredSessionId: (id: string | null) => void;
  hasArchivedSessions: boolean;
  /** Drag-and-drop: reorder a session from one index to another. */
  moveSession: (fromIndex: number, toIndex: number) => void;
};

/* ── Layout constants ── */
const NODE_VERTICAL_SPACING = 72;   // px between nodes — materially looser
const STAGGER_AMPLITUDE = 28;       // px zig-zag amplitude from centre
const FIRST_NODE_Y = 24;            // top padding before first node

function buildOrderedIds(sessions: SessionSummary[], showArchived: boolean): string[] {
  const visible = showArchived
    ? sessions
    : sessions.filter((s) => !s.isArchived);

  return [...visible]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((s) => s.id);
}

function assignProminence(index: number, total: number): ConstellationProminence {
  if (index === 0) return "anchor";
  if (total >= 4 && index >= total - 2) return "major";
  return "minor";
}

function layoutNodes(
  orderedIds: string[],
  sessionMap: Map<string, SessionSummary>,
): ConstellationNode[] {
  const total = orderedIds.length;
  return orderedIds
    .map((id, index) => {
      const session = sessionMap.get(id);
      if (!session) return null;
      return {
        session,
        prominence: assignProminence(index, total),
        xOffset: index % 2 === 0 ? STAGGER_AMPLITUDE : -STAGGER_AMPLITUDE,
        y: FIRST_NODE_Y + index * NODE_VERTICAL_SPACING,
      };
    })
    .filter((n): n is ConstellationNode => n != null);
}

export function useSessionConstellationModel({
  sessions,
  showArchived,
  initialSelectedId,
  onReorder,
}: UseSessionConstellationModelInput): UseSessionConstellationModelOutput {
  const hasArchivedSessions = useMemo(
    () => sessions.some((s) => s.isArchived),
    [sessions],
  );

  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    buildOrderedIds(sessions, showArchived),
  );

  // Rebuild when the visible session set changes while preserving manual reorder.
  const stableOrderedIds = useMemo(() => {
    const fresh = buildOrderedIds(sessions, showArchived);
    const currentSet = new Set(orderedIds);
    const freshSet = new Set(fresh);
    const sameSet =
      currentSet.size === freshSet.size &&
      fresh.every((id) => currentSet.has(id));
    if (sameSet) return orderedIds;
    setOrderedIds(fresh);
    return fresh;
  }, [sessions, showArchived, orderedIds]);

  const sessionMap = useMemo(() => {
    const map = new Map<string, SessionSummary>();
    for (const s of sessions) map.set(s.id, s);
    return map;
  }, [sessions]);

  const orderedSessions = useMemo(
    () =>
      stableOrderedIds
        .map((id) => sessionMap.get(id))
        .filter((s): s is SessionSummary => s != null),
    [stableOrderedIds, sessionMap],
  );

  const nodes = useMemo(
    () => layoutNodes(stableOrderedIds, sessionMap),
    [stableOrderedIds, sessionMap],
  );

  /* ── Selection ── */
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => {
    if (initialSelectedId && sessionMap.has(initialSelectedId)) {
      return initialSelectedId;
    }
    return stableOrderedIds[0] ?? null;
  });

  const effectiveSelectedId = useMemo(() => {
    if (selectedSessionId && stableOrderedIds.includes(selectedSessionId)) {
      return selectedSessionId;
    }
    return stableOrderedIds[0] ?? null;
  }, [selectedSessionId, stableOrderedIds]);

  const selectSession = useCallback((id: string) => {
    setSelectedSessionId(id);
  }, []);

  /* ── Hover ── */
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);

  /* ── Drag reorder ── */
  const moveSession = useCallback(
    (fromIndex: number, toIndex: number) => {
      setOrderedIds((prev) => {
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= prev.length ||
          toIndex >= prev.length ||
          fromIndex === toIndex
        ) {
          return prev;
        }
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        onReorder?.(next);
        return next;
      });
    },
    [onReorder],
  );

  return {
    nodes,
    orderedSessions,
    orderedIds: stableOrderedIds,
    selectedSessionId: effectiveSelectedId,
    selectSession,
    hoveredSessionId,
    setHoveredSessionId,
    hasArchivedSessions,
    moveSession,
  };
}
