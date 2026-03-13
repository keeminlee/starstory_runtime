import type { NarrativePhase, ProtoStarState } from "../narrative";

export type ProtoStarDisplayStage = 0 | 1;

export interface ProtoStarVisualState {
  id: string;
  phase: NarrativePhase;
  glowIntensity: number;
  glowColor: string;
  orbitSpeedSeconds: number;
  ringCount: number;
  particleRate: number;
  scale: number;
  animationPhase: string;
  displayStage: ProtoStarDisplayStage;
  isPermanent: boolean;
  label: string | null;
}

export interface SkyStarEntry {
  protoStar: ProtoStarState;
  visual: ProtoStarVisualState;
}

export interface PositionedStar extends SkyStarEntry {
  xPercent: number;
  yPercent: number;
}

export interface SkyModel {
  stars: PositionedStar[];
  focusedStarId: string | null;
}
