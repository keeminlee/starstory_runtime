"use client";

import type { SessionSummary } from "@/lib/types";
import { formatSessionDisplayTitle } from "@/lib/campaigns/display";
import type { ConstellationProminence } from "@/components/chronicle/use-session-rail-model";
import styles from "@/components/openalpha/sky/sky.module.css";

export const CENTRE_X = 120; // half of the 240 px constellation column

type SessionConstellationNodeProps = {
  session: SessionSummary;
  isSelected: boolean;
  isHovered: boolean;
  prominence: ConstellationProminence;
  xOffset: number;
  y: number;
  onSelect: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
};

export function SessionConstellationNode({
  session,
  isSelected,
  isHovered,
  prominence,
  xOffset,
  y,
  onSelect,
  onHoverEnter,
  onHoverLeave,
}: SessionConstellationNodeProps) {
  const displayTitle = formatSessionDisplayTitle({
    label: session.label,
    sessionId: session.id,
  });

  return (
    <div
      className={styles.homepageStarPosition}
      style={{
        left: CENTRE_X + xOffset,
        top: y,
        filter: isSelected ? "brightness(1.18)" : undefined,
      }}
      onClick={onSelect}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      role="option"
      aria-selected={isSelected}
      aria-label={displayTitle}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {isSelected ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: 0,
            top: 0,
            width: 28,
            height: 28,
            background: "radial-gradient(circle, rgba(255,224,163,0.26) 0%, rgba(255,224,163,0.1) 42%, rgba(255,224,163,0) 76%)",
            boxShadow: "0 0 32px rgba(255,210,140,0.28)",
          }}
        />
      ) : null}

      {/* Star dot — reuses .campaignStar prominence variants */}
      <div
        className={styles.campaignStar}
        data-prominence={prominence}
        style={
          isSelected
            ? {
                transform: "translate(-50%, -50%) scale(1.18)",
                boxShadow: "0 0 24px rgba(255,226,163,0.92), 0 0 56px rgba(255,200,120,0.42)",
              }
            : undefined
        }
      />

      {/* Tooltip — reuses ObserverTooltip CSS classes */}
      {isHovered ? (
        <div className={styles.observerTooltip}>
          <div className={styles.observerTooltipBody}>
            <div className={styles.observerTooltipTitle}>{displayTitle}</div>
            <div className={styles.observerTooltipHint}>{session.date}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
