"use client";

import { useCallback, useRef, useState } from "react";
import { StarfieldCanvas } from "./StarfieldCanvas";
import { StarLayer } from "./StarLayer";
import { ConstellationLayer } from "./ConstellationLayer";
import type { Star } from "@/lib/starstory/domain/sky/starData";
import type { SkyLink } from "@/lib/starstory/domain/sky/skyObserverTypes";
import type { ObserverStarPresentation } from "@/lib/starstory/domain/sky/observerPresentation";
import styles from "./sky.module.css";

const PHI_MIN = -30;
const PHI_MAX = 30;
const DRAG_SENSITIVITY = 0.3;

type SkyViewportProps = {
  stars: Star[];
  links: SkyLink[];
  onStarClick?: (id: string) => void;
  hoveredStarId?: string | null;
  highlightedCampaignId?: string | null;
  presentationByStarId?: Map<string, ObserverStarPresentation>;
  onStarHoverChange?: (starId: string | null) => void;
};

export function SkyViewport({
  stars,
  links,
  onStarClick,
  hoveredStarId,
  highlightedCampaignId,
  presentationByStarId,
  onStarHoverChange,
}: SkyViewportProps) {
  const [camera, setCamera] = useState({ theta: 0, phi: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const lastDragRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastDragRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;

    const dx = e.clientX - lastDragRef.current.x;
    const dy = e.clientY - lastDragRef.current.y;
    lastDragRef.current = { x: e.clientX, y: e.clientY };

    setCamera((prev) => ({
      theta: prev.theta - dx * DRAG_SENSITIVITY,
      phi: Math.max(PHI_MIN, Math.min(PHI_MAX, prev.phi + dy * DRAG_SENSITIVITY * 0.5)),
    }));
  }, []);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className={styles.skyViewport}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <StarfieldCanvas cameraTheta={camera.theta} cameraPhi={camera.phi} />
      <StarLayer
        stars={stars}
        cameraTheta={camera.theta}
        cameraPhi={camera.phi}
        onStarClick={onStarClick}
        hoveredStarId={hoveredStarId}
        presentationByStarId={presentationByStarId}
        onStarHoverChange={onStarHoverChange}
      />
      <ConstellationLayer
        stars={stars}
        links={links}
        cameraTheta={camera.theta}
        cameraPhi={camera.phi}
        highlightedCampaignId={highlightedCampaignId}
      />
    </div>
  );
}
