"use client";

import { useCallback, useRef, useState } from "react";
import { Archive, GripVertical } from "lucide-react";
import { SessionConstellationNode } from "@/components/chronicle/session-rail-node";
import { SessionConstellationEdge } from "@/components/chronicle/session-constellation-edge";
import type { ConstellationNode, ConstellationDragState } from "@/components/chronicle/use-session-rail-model";
import { CENTRE_X } from "@/components/chronicle/use-session-rail-model";
import { formatSessionDisplayTitle } from "@/lib/campaigns/display";
import type { SessionSummary } from "@/lib/types";
import styles from "@/components/openalpha/sky/sky.module.css";

const BOTTOM_PADDING = 72;
const ARCHIVE_HEADER_HEIGHT = 32;
const ARCHIVE_STAR_SPACING = 36;
const ARCHIVE_EMPTY_HEIGHT = 72;
/** Slot size mirrors the node component's hitbox. */
const SLOT_WIDTH = 210;
const SLOT_HEIGHT = 108;

type CampaignSessionConstellationProps = {
  nodes: ConstellationNode[];
  previewNodes: ConstellationNode[];
  selectedSessionId: string | null;
  hoveredSessionId: string | null;
  onSelect: (id: string) => void;
  onHoverEnter: (id: string) => void;
  onHoverLeave: () => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  hasArchivedSessions: boolean;
  archivedSessionCount: number;
  archivedSessions: SessionSummary[];
  isEditMode: boolean;
  onToggleEditMode: () => void;
  dragState: ConstellationDragState | null;
  onDragStart: (sessionId: string, pointerY: number, fromSource?: "live" | "archive") => void;
  onDragMove: (pointerY: number, isOverArchiveZone: boolean) => void;
  onDragEnd: () => void;
  onDragCancel: () => void;
};

export function CampaignSessionConstellation({
  nodes,
  previewNodes,
  selectedSessionId,
  hoveredSessionId,
  onSelect,
  onHoverEnter,
  onHoverLeave,
  showArchived,
  onToggleArchived,
  hasArchivedSessions,
  archivedSessionCount,
  archivedSessions,
  isEditMode,
  onToggleEditMode,
  dragState,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: CampaignSessionConstellationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const archiveZoneRef = useRef<HTMLDivElement>(null);
  const [archiveZoneHovered, setArchiveZoneHovered] = useState(false);

  const renderNodes = dragState ? previewNodes : nodes;
  const anchorNodes = dragState?.fromSource === "live" && dragState.isOverArchiveZone
    ? nodes
    : renderNodes;
  const lastNode = anchorNodes[anchorNodes.length - 1];
  const starAreaHeight = lastNode ? lastNode.y + BOTTOM_PADDING : 120;

  const archiveAreaHeight = isEditMode
    ? archivedSessions.length > 0
      ? ARCHIVE_HEADER_HEIGHT + archivedSessions.length * ARCHIVE_STAR_SPACING + 16
      : ARCHIVE_EMPTY_HEIGHT
    : 0;
  const constellationHeight = starAreaHeight + archiveAreaHeight;
  const previewNodeMap = new Map(renderNodes.map((node) => [node.session.id, node]));
  const positionedNodes = nodes
    .map((node) => previewNodeMap.get(node.session.id))
    .filter((node): node is ConstellationNode => node != null);

  /* ── Pointer handlers for drag tracking ── */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relY = e.clientY - rect.top;

      // Check if pointer is over archive zone
      let overArchive = false;
      if (archiveZoneRef.current) {
        const azRect = archiveZoneRef.current.getBoundingClientRect();
        overArchive = e.clientY >= azRect.top && e.clientY <= azRect.bottom;
      }
      setArchiveZoneHovered(overArchive);
      onDragMove(relY, overArchive);
    },
    [dragState, onDragMove],
  );

  const handlePointerUp = useCallback(() => {
    if (!dragState) return;
    onDragEnd();
    setArchiveZoneHovered(false);
  }, [dragState, onDragEnd]);

  const handlePointerCancel = useCallback(() => {
    onDragCancel();
    setArchiveZoneHovered(false);
  }, [onDragCancel]);

  const handleNodePointerDown = useCallback(
    (sessionId: string, e: React.PointerEvent, fromSource: "live" | "archive" = "live") => {
      if (!isEditMode) return;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      onDragStart(sessionId, relY, fromSource);
      // Capture pointer for reliable tracking even outside the element
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [isEditMode, onDragStart],
  );

  if (nodes.length === 0) {
    return (
      <div className="w-[340px] shrink-0 flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground text-center">No sessions yet.</p>
      </div>
    );
  }

  const isDragging = dragState !== null;
  const draggedSessionId = dragState?.sessionId ?? null;

  return (
    <div className="w-[340px] shrink-0 flex flex-col">
      {/* Edit mode toggle */}
      <div className="flex justify-end px-2 mb-2">
        <button
          type="button"
          onClick={onToggleEditMode}
          aria-pressed={isEditMode}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide transition-colors ${
            isEditMode
              ? "bg-primary/15 text-primary border border-primary/30"
              : "text-muted-foreground/70 hover:text-foreground/80 hover:bg-muted/50"
          }`}
          title={isEditMode ? "Exit edit mode" : "Reorder sessions"}
        >
          <GripVertical className="h-3 w-3" />
          {isEditMode ? "Done" : "Edit"}
        </button>
      </div>

      {/* Constellation area */}
      <div
        ref={containerRef}
        className="relative"
        style={{
          height: constellationHeight,
          overflow: "visible",
          touchAction: isDragging ? "none" : undefined,
          userSelect: isDragging ? "none" : undefined,
          transition: isDragging ? "none" : "height 220ms ease",
        }}
        role="listbox"
        aria-label="Session constellation"
        onPointerMove={isDragging ? handlePointerMove : undefined}
        onPointerUp={isDragging ? handlePointerUp : undefined}
        onPointerCancel={isDragging ? handlePointerCancel : undefined}
      >
        {/* SVG edge layer */}
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
          aria-hidden="true"
        >
          {renderNodes.map((node, i) => {
            const next = renderNodes[i + 1];
            if (!next) return null;
            // During drag, dim edges connected to the dragged node
            const touchesDragged =
              draggedSessionId === node.session.id || draggedSessionId === next.session.id;
            if (isDragging && touchesDragged) return null;
            return (
              <SessionConstellationEdge
                key={`${node.session.id}-${next.session.id}`}
                from={node}
                to={next}
                isActive={selectedSessionId === node.session.id || selectedSessionId === next.session.id}
              />
            );
          })}
        </svg>

        {/* Star nodes */}
        {positionedNodes.map((node) => {
          const isBeingDragged = draggedSessionId === node.session.id;
          return (
            <SessionConstellationNode
              key={node.session.id}
              session={node.session}
              isSelected={selectedSessionId === node.session.id}
              isHovered={hoveredSessionId === node.session.id}
              prominence={node.prominence}
              xOffset={node.xOffset}
              y={node.y}
              onSelect={() => onSelect(node.session.id)}
              onHoverEnter={() => onHoverEnter(node.session.id)}
              onHoverLeave={onHoverLeave}
              isEditMode={isEditMode}
              isDragging={isBeingDragged}
              onPointerDown={
                isEditMode
                  ? (e: React.PointerEvent) => handleNodePointerDown(node.session.id, e)
                  : undefined
              }
            />
          );
        })}

        {/* Drag ghost — floating node at pointer position */}
        {isDragging && dragState && (() => {
          const draggedNode = nodes.find((n) => n.session.id === draggedSessionId);
          // For archive-source drags, build a temporary node representation
          const ghostProminence = draggedNode?.prominence ?? "minor";
          const ghostXOffset = draggedNode?.xOffset ?? 0;
          return (
            <div
              className={styles.homepageStarPosition}
              style={{
                left: CENTRE_X + ghostXOffset,
                top: dragState.pointerY,
                width: SLOT_WIDTH,
                height: SLOT_HEIGHT,
                opacity: 0.75,
                zIndex: 50,
                pointerEvents: "none",
                filter: "brightness(1.3)",
                transition: "none",
              }}
              aria-hidden="true"
            >
              <div className="absolute left-1/2 top-1/2">
                <div
                  className={styles.campaignStar}
                  data-prominence={ghostProminence}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    transform: "translate(-50%, -50%) scale(1.3)",
                    boxShadow: "0 0 24px rgba(255,226,163,0.92), 0 0 56px rgba(255,200,120,0.42)",
                  }}
                />
              </div>
            </div>
          );
        })()}

        {/* Archive area (visible in edit mode) */}
        {isEditMode ? (
          <div
            ref={archiveZoneRef}
            className={`absolute left-0 right-0 rounded-lg border-2 border-dashed transition-colors ${
              archiveZoneHovered && isDragging
                ? "border-destructive/60 bg-destructive/10"
                : "border-muted-foreground/20 bg-muted/5"
            }`}
            style={{
              top: starAreaHeight,
              height: archiveAreaHeight,
              transition: isDragging
                ? "border-color 180ms ease, background-color 180ms ease"
                : "top 220ms ease, height 220ms ease, border-color 180ms ease, background-color 180ms ease",
            }}
          >
            {archivedSessions.length > 0 ? (
              <>
                <div
                  className="flex items-center gap-2 px-4 text-[10px] font-semibold tracking-wide text-muted-foreground/40 uppercase"
                  style={{ height: ARCHIVE_HEADER_HEIGHT }}
                >
                  <Archive className="h-3 w-3" />
                  Archive · {archivedSessions.length}
                </div>
                {archivedSessions.map((session, i) => {
                  const isBeingDragged = draggedSessionId === session.id;
                  const title = formatSessionDisplayTitle({ label: session.label, sessionId: session.id });
                  return (
                    <div
                      key={session.id}
                      className="relative flex items-center gap-3 px-4"
                      style={{
                        height: ARCHIVE_STAR_SPACING,
                        opacity: isBeingDragged ? 0.3 : 1,
                        transition: isBeingDragged ? "none" : "opacity 200ms ease",
                        cursor: "grab",
                      }}
                      onPointerDown={(e) => handleNodePointerDown(session.id, e, "archive")}
                    >
                      <div
                        className={styles.campaignStar}
                        data-prominence="minor"
                        style={{ flexShrink: 0 }}
                      />
                      <span
                        className="text-[10px] font-medium tracking-wide truncate"
                        style={{ color: "rgba(180, 195, 230, 0.45)" }}
                      >
                        {title}
                      </span>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className={`flex items-center gap-2 text-xs font-medium ${
                  archiveZoneHovered && isDragging
                    ? "text-destructive"
                    : "text-muted-foreground/40"
                }`}>
                  <Archive className="h-3.5 w-3.5" />
                  Move stars here to archive them
                </span>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Archive toggle */}
      {hasArchivedSessions && !isEditMode ? (
        <div className="mt-4 px-2">
          <button
            type="button"
            onClick={onToggleArchived}
            aria-pressed={showArchived}
            className={`group flex h-9 w-9 items-center overflow-hidden rounded-full border px-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.16)] backdrop-blur transition-[width,border-color,background-color] duration-200 ${
              showArchived
                ? "border-primary/32 bg-primary/10 text-foreground hover:w-[12rem]"
                : "border-border/70 bg-background/62 text-foreground/90 hover:w-[12rem] hover:border-primary/25 hover:bg-background/82"
            }`}
            title={showArchived ? "Hide archive" : "View archive"}
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <Archive className={`h-3.5 w-3.5 shrink-0 ${showArchived ? "text-primary" : "text-primary/80"}`} />
              <span className="max-w-0 overflow-hidden text-[10px] font-semibold tracking-wide opacity-0 transition-all duration-200 group-hover:max-w-[8rem] group-hover:opacity-100">
                {showArchived ? `Showing Archive · ${archivedSessionCount}` : `View Archive · ${archivedSessionCount}`}
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
