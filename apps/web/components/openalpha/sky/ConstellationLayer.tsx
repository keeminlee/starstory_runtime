"use client";

import type { Star } from "@/lib/starstory/domain/sky/starData";
import type { SkyLink } from "@/lib/starstory/domain/sky/skyObserverTypes";
import { PARALLAX_SPEEDS } from "@/lib/starstory/domain/sky/starData";
import styles from "./sky.module.css";

const VIEWPORT_DEGREES = 120;
const HORIZONTAL_WRAP_PERCENT = (360 / VIEWPORT_DEGREES) * 100;

type ConstellationLayerProps = {
  stars: Star[];
  links: SkyLink[];
  cameraTheta: number;
  cameraPhi: number;
  highlightedCampaignId?: string | null;
};

function thetaToPercent(starTheta: number, cameraTheta: number, speed: number): number {
  const effectiveCamera = cameraTheta * speed;
  let diff = starTheta - effectiveCamera;
  diff = ((diff % 360) + 540) % 360 - 180;
  return 50 + (diff / VIEWPORT_DEGREES) * 100;
}

function chooseNearestWrappedValue(value: number, reference: number): number {
  const candidates = [
    value - HORIZONTAL_WRAP_PERCENT,
    value,
    value + HORIZONTAL_WRAP_PERCENT,
  ];

  return candidates.reduce((closest, candidate) => {
    return Math.abs(candidate - reference) < Math.abs(closest - reference) ? candidate : closest;
  }, candidates[0]);
}

function phiToPercent(starPhi: number, cameraPhi: number, speed: number): number {
  const effectiveCamera = cameraPhi * speed;
  const diff = starPhi - effectiveCamera;
  return 50 - (diff / 60) * 100;
}

export function ConstellationLayer({ stars, links, cameraTheta, cameraPhi, highlightedCampaignId }: ConstellationLayerProps) {
  if (links.length === 0) {
    // Fallback: connect campaign stars in theta order if no explicit links
    const campaignStars = stars.filter((star) => star.type === "campaign").sort((left, right) => left.theta - right.theta);

    if (campaignStars.length < 2) {
      return null;
    }

    const projectedStars: Array<{ id: string; screenX: number; screenY: number }> = [];
    for (const star of campaignStars) {
      const speed = PARALLAX_SPEEDS[star.layer];
      const baseX = thetaToPercent(star.theta, cameraTheta, speed);
      const previousScreenX = projectedStars.at(-1)?.screenX;
      const screenX = previousScreenX === undefined ? baseX : chooseNearestWrappedValue(baseX, previousScreenX);
      const screenY = phiToPercent(star.phi, cameraPhi, speed);
      projectedStars.push({ id: star.id, screenX, screenY });
    }

    const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (let i = 0; i < projectedStars.length - 1; i++) {
      const fromStar = projectedStars[i];
      const toStar = projectedStars[i + 1];
      if (Math.max(fromStar.screenX, toStar.screenX) < -10 || Math.min(fromStar.screenX, toStar.screenX) > 110) {
        continue;
      }
      lines.push({ x1: fromStar.screenX, y1: fromStar.screenY, x2: toStar.screenX, y2: toStar.screenY });
    }

    return (
      <svg className={styles.constellationLayer} viewBox="0 0 100 100" preserveAspectRatio="none">
        {lines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="rgba(180,200,255,0.12)" strokeWidth="0.15" />
        ))}
      </svg>
    );
  }

  // Use explicit SkyLink data for constellation lines
  const starMap = new Map(stars.map((s) => [s.id, s]));
  const projectedPositions = new Map<string, { screenX: number; screenY: number }>();

  for (const star of stars) {
    const speed = PARALLAX_SPEEDS[star.layer];
    const screenX = thetaToPercent(star.theta, cameraTheta, speed);
    const screenY = phiToPercent(star.phi, cameraPhi, speed);
    projectedPositions.set(star.id, { screenX, screenY });
  }

  return (
    <svg className={styles.constellationLayer} viewBox="0 0 100 100" preserveAspectRatio="none">
      {links.map((link) => {
        const from = projectedPositions.get(link.from);
        const to = projectedPositions.get(link.to);
        if (!from || !to) return null;

        const isHighlighted = highlightedCampaignId != null && link.campaignId === highlightedCampaignId;
        const opacity = isHighlighted ? 0.28 : 0.12;
        const width = isHighlighted ? 0.22 : 0.15;

        if (Math.max(from.screenX, to.screenX) < -10 || Math.min(from.screenX, to.screenX) > 110) {
          return null;
        }

        return (
          <line
            key={link.id}
            x1={from.screenX}
            y1={from.screenY}
            x2={to.screenX}
            y2={to.screenY}
            stroke={`rgba(180,200,255,${opacity})`}
            strokeWidth={width}
          />
        );
      })}
    </svg>
  );
}
