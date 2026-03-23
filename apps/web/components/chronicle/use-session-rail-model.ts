"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/* ── Drag state exposed to the constellation component ── */
export type ConstellationDragState = {
  /** Session being dragged. */
  sessionId: string;
  /** Where the drag started: 'live' = from the live constellation, 'archive' = from the archive area. */
  fromSource: "live" | "archive";
  /** Index in orderedIds before the drag began (-1 for archive source). */
  fromIndex: number;
  /** Current target slot index (where the node would land). */
  targetIndex: number;
  /** True when cursor is over the archive zone. */
  isOverArchiveZone: boolean;
  /** Pointer Y relative to the constellation container top. */
  pointerY: number;
};

/* ── Input / output ── */
type UseSessionConstellationModelInput = {
  sessions: SessionSummary[];
  showArchived: boolean;
  initialSelectedId?: string | null;
  initialDisplayOrder?: string[] | null;
  onReorder?: (orderedIds: string[]) => void;
  onArchive?: (sessionId: string) => void;
  onUnarchive?: (sessionId: string) => void;
};

type UseSessionConstellationModelOutput = {
  nodes: ConstellationNode[];
  orderedSessions: SessionSummary[];
  orderedIds: string[];
  selectedSessionId: string | null;
  selectSession: (id: string) => void;
  hoveredSessionId: string | null;
  setHoveredSessionId: (id: string | null) => void;
  hasArchivedSessions: boolean;
  moveSession: (fromIndex: number, toIndex: number) => void;

  /* ── Edit mode ── */
  isEditMode: boolean;
  toggleEditMode: () => void;

  /* ── Archived sessions (for rendering in archive area) ── */
  archivedSessions: SessionSummary[];

  /* ── Drag state ── */
  dragState: ConstellationDragState | null;
  /** Nodes re-laid-out with the dragged item removed (gap preview). */
  previewNodes: ConstellationNode[];
  startDrag: (sessionId: string, pointerY: number, fromSource?: "live" | "archive") => void;
  updateDrag: (pointerY: number, isOverArchiveZone: boolean) => void;
  endDrag: () => void;
  cancelDrag: () => void;
};

/* ── Layout constants (exported for use in components) ── */
export const NODE_VERTICAL_SPACING = 108;
export const STAGGER_AMPLITUDE = 42;
export const FIRST_NODE_Y = 36;
export const CENTRE_X = 140;

/** Pointer must move at least this far before a pointerdown becomes a drag. */
const DRAG_THRESHOLD = 5;

function buildOrderedIds(
  sessions: SessionSummary[],
  showArchived: boolean,
  customOrder?: string[] | null,
): string[] {
  const visible = showArchived
    ? sessions
    : sessions.filter((s) => !s.isArchived);

  const visibleIds = new Set(visible.map((s) => s.id));

  // If a custom order is provided, use it — but only for ids that still exist.
  if (customOrder && customOrder.length > 0) {
    const ordered: string[] = [];
    for (const id of customOrder) {
      if (visibleIds.has(id)) {
        ordered.push(id);
        visibleIds.delete(id);
      }
    }
    // Append any new sessions not yet in the custom order (sorted by date desc).
    const remaining = [...visibleIds];
    const sessionMap = new Map(visible.map((s) => [s.id, s]));
    remaining.sort((a, b) => {
      const sa = sessionMap.get(a);
      const sb = sessionMap.get(b);
      return new Date(sb?.date ?? 0).getTime() - new Date(sa?.date ?? 0).getTime();
    });
    return [...ordered, ...remaining];
  }

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

/** Given a pointer Y inside the constellation, return the closest slot index. */
export function findTargetSlotIndex(pointerY: number, slotCount: number): number {
  if (slotCount === 0) return 0;
  const raw = Math.round((pointerY - FIRST_NODE_Y) / NODE_VERTICAL_SPACING);
  return Math.max(0, Math.min(slotCount - 1, raw));
}

export function useSessionConstellationModel({
  sessions,
  showArchived,
  initialSelectedId,
  initialDisplayOrder,
  onReorder,
  onArchive,
  onUnarchive,
}: UseSessionConstellationModelInput): UseSessionConstellationModelOutput {
  const hasArchivedSessions = useMemo(
    () => sessions.some((s) => s.isArchived),
    [sessions],
  );

  const archivedSessions = useMemo(
    () => sessions.filter((s) => s.isArchived),
    [sessions],
  );

  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    buildOrderedIds(sessions, showArchived, initialDisplayOrder),
  );

  // Rebuild when the visible session set changes while preserving manual reorder.
  const stableOrderedIds = useMemo(() => {
    const fresh = buildOrderedIds(sessions, showArchived, orderedIds);
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
    if (selectedSessionId && sessionMap.has(selectedSessionId)) {
      return selectedSessionId;
    }
    return stableOrderedIds[0] ?? null;
  }, [selectedSessionId, sessionMap, stableOrderedIds]);

  const selectSession = useCallback((id: string) => {
    setSelectedSessionId(id);
  }, []);

  /* ── Hover ── */
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);

  /* ── Edit mode ── */
  const [isEditMode, setIsEditMode] = useState(false);
  const toggleEditMode = useCallback(() => {
    setIsEditMode((prev) => !prev);
    setDragState(null);
  }, []);

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

  /* ── Pointer-based drag state ── */
  const [dragState, setDragState] = useState<ConstellationDragState | null>(null);
  const dragStartYRef = useRef(0);
  /** Tracks a pending archive→live insertion until sessions refresh. */
  const pendingInsertionRef = useRef<{ sessionId: string; atIndex: number } | null>(null);

  const startDrag = useCallback(
    (sessionId: string, pointerY: number, fromSource: "live" | "archive" = "live") => {
      dragStartYRef.current = pointerY;
      if (fromSource === "live") {
        const fromIndex = stableOrderedIds.indexOf(sessionId);
        if (fromIndex < 0) return;
        setDragState({
          sessionId,
          fromSource: "live",
          fromIndex,
          targetIndex: fromIndex,
          isOverArchiveZone: false,
          pointerY,
        });
      } else {
        setDragState({
          sessionId,
          fromSource: "archive",
          fromIndex: -1,
          targetIndex: stableOrderedIds.length,
          isOverArchiveZone: true,
          pointerY,
        });
      }
    },
    [stableOrderedIds],
  );

  const updateDrag = useCallback(
    (pointerY: number, isOverArchiveZone: boolean) => {
      setDragState((prev) => {
        if (!prev) return null;
        const dy = Math.abs(pointerY - dragStartYRef.current);
        // Don't commit to a drag until the cursor has moved beyond threshold
        const committed = dy > DRAG_THRESHOLD;

        let targetIndex: number;
        if (prev.fromSource === "live") {
          const slotCount = stableOrderedIds.length;
          targetIndex = committed
            ? findTargetSlotIndex(pointerY, slotCount)
            : prev.fromIndex;
        } else {
          // Archive→live: one extra slot for insertion at end
          const slotCount = stableOrderedIds.length + 1;
          targetIndex = committed
            ? findTargetSlotIndex(pointerY, slotCount)
            : prev.targetIndex;
        }

        return {
          ...prev,
          pointerY,
          targetIndex: isOverArchiveZone
            ? (prev.fromSource === "live" ? prev.fromIndex : prev.targetIndex)
            : targetIndex,
          isOverArchiveZone,
        };
      });
    },
    [stableOrderedIds.length],
  );

  const endDrag = useCallback(() => {
    if (!dragState) return;
    const dy = Math.abs(dragState.pointerY - dragStartYRef.current);
    if (dy <= DRAG_THRESHOLD) {
      // Was a click, not a drag
      if (dragState.fromSource === "live") selectSession(dragState.sessionId);
    } else if (dragState.fromSource === "live") {
      if (dragState.isOverArchiveZone) {
        onArchive?.(dragState.sessionId);
      } else if (dragState.targetIndex !== dragState.fromIndex) {
        moveSession(dragState.fromIndex, dragState.targetIndex);
      }
    } else if (dragState.fromSource === "archive") {
      if (!dragState.isOverArchiveZone) {
        // Archive → live: store target position, then trigger unarchive
        pendingInsertionRef.current = {
          sessionId: dragState.sessionId,
          atIndex: dragState.targetIndex,
        };
        onUnarchive?.(dragState.sessionId);
      }
    }
    setDragState(null);
  }, [dragState, selectSession, moveSession, onArchive, onUnarchive]);

  const cancelDrag = useCallback(() => {
    setDragState(null);
  }, []);

  /* ── Apply pending archive→live insertion once the session is visible ── */
  useEffect(() => {
    const pending = pendingInsertionRef.current;
    if (!pending) return;
    const visible = showArchived
      ? sessions
      : sessions.filter((s) => !s.isArchived);
    if (!visible.some((s) => s.id === pending.sessionId)) return;
    pendingInsertionRef.current = null;
    setOrderedIds((prev) => {
      const next = prev.filter((id) => id !== pending.sessionId);
      const insertAt = Math.min(pending.atIndex, next.length);
      next.splice(insertAt, 0, pending.sessionId);
      onReorder?.(next);
      return next;
    });
  }, [sessions, showArchived, onReorder]);

  /* ── Preview nodes: layout with dragged node at target position ── */
  const previewNodes = useMemo(() => {
    if (!dragState) return nodes;
    const dy = Math.abs(dragState.pointerY - dragStartYRef.current);
    if (dy <= DRAG_THRESHOLD) return nodes;

    // Build preview order: remove dragged, insert at target
    const preview = stableOrderedIds.filter((id) => id !== dragState.sessionId);
    if (!dragState.isOverArchiveZone) {
      const insertAt = Math.min(dragState.targetIndex, preview.length);
      preview.splice(insertAt, 0, dragState.sessionId);
    }
    return layoutNodes(preview, sessionMap);
  }, [dragState, nodes, stableOrderedIds, sessionMap]);

  return {
    nodes,
    orderedSessions,
    orderedIds: stableOrderedIds,
    selectedSessionId: effectiveSelectedId,
    selectSession,
    hoveredSessionId,
    setHoveredSessionId,
    hasArchivedSessions,
    archivedSessions,
    moveSession,
    isEditMode,
    toggleEditMode,
    dragState,
    previewNodes,
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
  };
}
