"use client";

import { Archive } from "lucide-react";
import { SessionConstellationNode } from "@/components/chronicle/session-rail-node";
import { SessionConstellationEdge } from "@/components/chronicle/session-constellation-edge";
import type { ConstellationNode } from "@/components/chronicle/use-session-rail-model";

const BOTTOM_PADDING = 48;

type CampaignSessionConstellationProps = {
  nodes: ConstellationNode[];
  selectedSessionId: string | null;
  hoveredSessionId: string | null;
  onSelect: (id: string) => void;
  onHoverEnter: (id: string) => void;
  onHoverLeave: () => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  hasArchivedSessions: boolean;
  archivedSessionCount: number;
};

export function CampaignSessionConstellation({
  nodes,
  selectedSessionId,
  hoveredSessionId,
  onSelect,
  onHoverEnter,
  onHoverLeave,
  showArchived,
  onToggleArchived,
  hasArchivedSessions,
  archivedSessionCount,
}: CampaignSessionConstellationProps) {
  const lastNode = nodes[nodes.length - 1];
  const constellationHeight = lastNode ? lastNode.y + BOTTOM_PADDING : 120;

  if (nodes.length === 0) {
    return (
      <div className="w-[240px] shrink-0 flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground text-center">No sessions yet.</p>
      </div>
    );
  }

  return (
    <div className="w-[240px] shrink-0 flex flex-col">
      {/* Constellation area — SVG edges + HTML star positions (HomepageConstellationSection pattern) */}
      <div
        className="relative"
        style={{ height: constellationHeight, overflow: "visible" }}
        role="listbox"
        aria-label="Session constellation"
      >
        {/* SVG edge layer (same pattern as homepageConstellationSvg) */}
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
          {nodes.map((node, i) => {
            const next = nodes[i + 1];
            if (!next) return null;
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

        {/* Star nodes — HTML absolutely-positioned (same pattern as homepageStarPosition) */}
        {nodes.map((node) => (
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
          />
        ))}
      </div>

      {/* Archive toggle */}
      {hasArchivedSessions ? (
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
