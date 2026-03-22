"use client";

// Preserved for future logged-in product surfaces.
// The simplified homepage no longer renders constellations, but this component,
// its mapper, and its presentation pipeline remain reusable for an Observatory-style view.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ObserverTooltip } from "@/components/sky/ObserverTooltip";
import type { SkyStarNode, SkyLink } from "@/lib/starstory/domain/sky/skyObserverTypes";
import type { ObserverStarPresentation } from "@/lib/starstory/domain/sky/observerPresentation";
import styles from "@/components/openalpha/sky/sky.module.css";

type Props = {
  nodes: SkyStarNode[];
  links: SkyLink[];
  personalAnchorNodeId: string | null;
  presentations: ObserverStarPresentation[];
  contentHeight: number;
};

const PX_PER_UNIT = 8;
const MIN_SECTION_HEIGHT_PX = 400;

export function HomepageConstellationSection({ nodes, links, presentations, contentHeight }: Props) {
  const router = useRouter();
  const [hoveredStarId, setHoveredStarId] = useState<string | null>(null);
  const sectionHeightPx = Math.max(MIN_SECTION_HEIGHT_PX, contentHeight * PX_PER_UNIT);

  const presentationByStarId = useMemo(() => {
    const map = new Map<string, ObserverStarPresentation>();
    for (const p of presentations) {
      map.set(p.starId, p);
    }
    return map;
  }, [presentations]);

  const highlightedCampaignId = useMemo(() => {
    if (!hoveredStarId) return undefined;
    const node = nodes.find((n) => n.id === hoveredStarId);
    return node?.campaignId;
  }, [hoveredStarId, nodes]);

  const handleStarClick = useCallback(
    (starId: string) => {
      const presentation = presentationByStarId.get(starId);
      if (presentation?.href) {
        router.push(presentation.href);
      }
    },
    [presentationByStarId, router],
  );

  if (nodes.length === 0) {
    return <div id="constellations" />;
  }

  return (
    <div id="constellations" className={styles.homepageConstellationSection} style={{ height: sectionHeightPx }}>
      {/* Constellation lines */}
      <svg
        className={styles.homepageConstellationSvg}
        viewBox={`0 0 100 ${contentHeight}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {links.map((link) => {
          const from = nodes.find((n) => n.id === link.from);
          const to = nodes.find((n) => n.id === link.to);
          if (!from || !to) return null;
          const isHighlighted = highlightedCampaignId === link.campaignId;
          return (
            <line
              key={link.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={isHighlighted ? "rgba(200,220,255,0.28)" : "rgba(180,200,255,0.10)"}
              strokeWidth={isHighlighted ? 0.22 : 0.14}
            />
          );
        })}
      </svg>

      {/* Stars */}
      {nodes.map((node) => {
        const presentation = presentationByStarId.get(node.id);
        const isHovered = hoveredStarId === node.id;

        return (
          <div
            key={node.id}
            className={styles.homepageStarPosition}
            style={{ left: `${node.x}%`, top: `${(node.y / contentHeight) * 100}%` }}
            onClick={() => handleStarClick(node.id)}
            onMouseEnter={() => setHoveredStarId(node.id)}
            onMouseLeave={() => setHoveredStarId(null)}
          >
            <div
              className={styles.campaignStar}
              data-prominence={node.prominence}
            />
            {isHovered && presentation ? (
              <ObserverTooltip presentation={presentation} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
