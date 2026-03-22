"use client";

import { useMemo } from "react";
import type { Star } from "@/lib/starstory/domain/sky/starData";
import { PARALLAX_SPEEDS } from "@/lib/starstory/domain/sky/starData";
import type { ObserverStarPresentation } from "@/lib/starstory/domain/sky/observerPresentation";
import { ObserverTooltip } from "@/components/sky/ObserverTooltip";
import styles from "./sky.module.css";

const VIEWPORT_DEGREES = 120;

type StarLayerProps = {
  stars: Star[];
  cameraTheta: number;
  cameraPhi: number;
  onStarClick?: (id: string) => void;
  hoveredStarId?: string | null;
  presentationByStarId?: Map<string, ObserverStarPresentation>;
  onStarHoverChange?: (starId: string | null) => void;
};

function thetaToScreen(starTheta: number, cameraTheta: number, speed: number): number {
  const effectiveCamera = cameraTheta * speed;
  let diff = starTheta - effectiveCamera;
  diff = ((diff % 360) + 540) % 360 - 180;
  return 50 + (diff / VIEWPORT_DEGREES) * 100;
}

function phiToScreen(starPhi: number, cameraPhi: number, speed: number): number {
  const effectiveCamera = cameraPhi * speed;
  const diff = starPhi - effectiveCamera;
  return 50 - (diff / 60) * 100;
}

export function StarLayer({
  stars,
  cameraTheta,
  cameraPhi,
  onStarClick,
  hoveredStarId,
  presentationByStarId,
  onStarHoverChange,
}: StarLayerProps) {
  const positioned = useMemo(() => {
    return stars.map((star) => {
      const speed = PARALLAX_SPEEDS[star.layer];
      return {
        ...star,
        screenX: thetaToScreen(star.theta, cameraTheta, speed),
        screenY: phiToScreen(star.phi, cameraPhi, speed),
      };
    });
  }, [stars, cameraTheta, cameraPhi]);

  return (
    <div className={styles.starLayer}>
      {positioned.map((star) => {
        const presentation = presentationByStarId?.get(star.id);
        const isHovered = hoveredStarId === star.id;

        return (
          <div
            key={star.id}
            className={styles.starPosition}
            style={{
              left: `${star.screenX}%`,
              top: `${star.screenY}%`,
            }}
            onClick={() => onStarClick?.(star.id)}
            onMouseEnter={() => onStarHoverChange?.(star.id)}
            onMouseLeave={() => onStarHoverChange?.(null)}
          >
            <div
              className={styles.campaignStar}
              data-layer={star.layer}
              data-prominence={star.prominence ?? "minor"}
              data-born={star.type === "campaign" && star.nodeKind === "anchor" ? "true" : undefined}
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
