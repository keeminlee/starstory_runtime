"use client";

import type { Star } from "@/lib/starstory/domain/sky/starData";
import { PARALLAX_SPEEDS } from "@/lib/starstory/domain/sky/starData";
import styles from "./sky.module.css";

const VIEWPORT_DEGREES = 120;
const HORIZONTAL_WRAP_PERCENT = (360 / VIEWPORT_DEGREES) * 100;

type ConstellationLayerProps = {
  stars: Star[];
  cameraTheta: number;
  cameraPhi: number;
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

export function ConstellationLayer({ stars, cameraTheta, cameraPhi }: ConstellationLayerProps) {
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

    projectedStars.push({
      id: star.id,
      screenX,
      screenY,
    });
  }

  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 0; i < projectedStars.length - 1; i++) {
    const fromStar = projectedStars[i];
    const toStar = projectedStars[i + 1];
    if (Math.max(fromStar.screenX, toStar.screenX) < -10 || Math.min(fromStar.screenX, toStar.screenX) > 110) {
      continue;
    }

    lines.push({
      x1: fromStar.screenX,
      y1: fromStar.screenY,
      x2: toStar.screenX,
      y2: toStar.screenY,
    });
  }

  return (
    <svg className={styles.constellationLayer} viewBox="0 0 100 100" preserveAspectRatio="none">
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke="rgba(180,200,255,0.12)"
          strokeWidth="0.15"
        />
      ))}
    </svg>
  );
}
