"use client";

import type { ConstellationNode } from "@/components/chronicle/use-session-rail-model";

type SessionConstellationEdgeProps = {
  from: ConstellationNode;
  to: ConstellationNode;
  isActive?: boolean;
};

const CENTRE_X = 120; // must match centreX in SessionConstellationNode

export function SessionConstellationEdge({ from, to, isActive = false }: SessionConstellationEdgeProps) {
  const x1 = CENTRE_X + from.xOffset;
  const y1 = from.y;
  const x2 = CENTRE_X + to.xOffset;
  const y2 = to.y;

  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={isActive ? "rgba(255, 226, 163, 0.4)" : "rgba(248, 241, 184, 0.12)"}
      strokeWidth={isActive ? 1.5 : 1}
      strokeLinecap="round"
    />
  );
}
