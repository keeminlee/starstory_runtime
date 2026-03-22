"use client";

import type { SessionSummary } from "@/lib/types";
import { formatSessionDisplayTitle } from "@/lib/campaigns/display";
import type { ConstellationProminence } from "@/components/chronicle/use-session-rail-model";
import { CENTRE_X } from "@/components/chronicle/use-session-rail-model";
import styles from "@/components/openalpha/sky/sky.module.css";

/** Slot dimensions — hover hitbox covers the full invisible bounding cell. */
const SLOT_WIDTH = 210;
const SLOT_HEIGHT = 108; // matches NODE_VERTICAL_SPACING in use-session-rail-model

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
  isEditMode?: boolean;
  isDragging?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
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
  isEditMode = false,
  isDragging = false,
  onPointerDown,
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
        width: SLOT_WIDTH,
        height: SLOT_HEIGHT,
        filter: isSelected && !isDragging ? "brightness(1.18)" : undefined,
        opacity: isDragging ? 0.3 : undefined,
        transition: isDragging ? "none" : "top 200ms ease, left 200ms ease, opacity 200ms ease",
        cursor: isEditMode ? "grab" : "pointer",
      }}
      onClick={isEditMode ? undefined : onSelect}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      onPointerDown={onPointerDown}
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
      {/* Visual anchor — zero-sized point at slot centre keeps halo/star/tooltip offsets unchanged */}
      <div className="absolute left-1/2 top-1/2">
        {isSelected && !isDragging ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: 0,
              top: 0,
              width: 51,
              height: 51,
              background:
                "radial-gradient(circle, rgba(255,224,163,0.26) 0%, rgba(255,224,163,0.1) 42%, rgba(255,224,163,0) 76%)",
              boxShadow: "0 0 32px rgba(255,210,140,0.28)",
            }}
          />
        ) : null}

        {/* Star dot — reuses .campaignStar prominence variants */}
        <div
          className={styles.campaignStar}
          data-prominence={prominence}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: isSelected && !isDragging
              ? "translate(-50%, -50%) scale(1.18)"
              : "translate(-50%, -50%)",
            ...(isSelected && !isDragging
              ? {
                  boxShadow:
                    "0 0 24px rgba(255,226,163,0.92), 0 0 56px rgba(255,200,120,0.42)",
                }
              : {}),
          }}
        />

        {/* Edit mode grip indicator */}
        {isEditMode && !isDragging ? (
          <div
            className="pointer-events-none absolute"
            style={{
              left: 14,
              top: -4,
              opacity: isHovered ? 0.7 : 0.3,
              transition: "opacity 150ms",
            }}
            aria-hidden="true"
          >
            <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor" className="text-muted-foreground">
              <circle cx="1.5" cy="1.5" r="1" />
              <circle cx="4.5" cy="1.5" r="1" />
              <circle cx="1.5" cy="5" r="1" />
              <circle cx="4.5" cy="5" r="1" />
              <circle cx="1.5" cy="8.5" r="1" />
              <circle cx="4.5" cy="8.5" r="1" />
            </svg>
          </div>
        ) : null}

        {/* Edit mode label — positioned outward from stagger direction */}
        {isEditMode && !isDragging ? (
          <div
            className="pointer-events-none absolute whitespace-nowrap"
            style={{
              [xOffset >= 0 ? "left" : "right"]: 20,
              top: -2,
              transform: "translateY(-50%)",
            }}
            aria-hidden="true"
          >
            <span
              className="text-[10px] font-medium tracking-wide"
              style={{ color: "rgba(180, 195, 230, 0.55)" }}
            >
              {displayTitle}
            </span>
          </div>
        ) : null}

        {/* Tooltip — reuses ObserverTooltip CSS classes */}
        {isHovered && !isDragging ? (
          <div className={styles.observerTooltip}>
            <div className={styles.observerTooltipBody}>
              <div className={styles.observerTooltipTitle}>{displayTitle}</div>
              <div className={styles.observerTooltipHint}>{session.date}</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { CENTRE_X };
