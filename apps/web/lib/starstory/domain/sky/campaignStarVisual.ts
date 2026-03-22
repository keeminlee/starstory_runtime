import type { SkyStarNode, StarProminence } from "./skyObserverTypes";

export type CampaignStarVisualState = {
  prominence: StarProminence;
  brightness: number;
  haloRadius: number;
  bloomStrength: number;
  lineOpacity: number;
  hovered: boolean;
  selected: boolean;
};

const VISUALS_BY_PROMINENCE: Record<StarProminence, Omit<CampaignStarVisualState, "hovered" | "selected">> = {
  minor: {
    prominence: "minor",
    brightness: 0.74,
    haloRadius: 20,
    bloomStrength: 0.52,
    lineOpacity: 0.18,
  },
  major: {
    prominence: "major",
    brightness: 0.88,
    haloRadius: 26,
    bloomStrength: 0.68,
    lineOpacity: 0.24,
  },
  anchor: {
    prominence: "anchor",
    brightness: 1,
    haloRadius: 34,
    bloomStrength: 0.82,
    lineOpacity: 0.32,
  },
};

export function buildCampaignStarVisualState(
  node: SkyStarNode,
  options?: { hovered?: boolean; selected?: boolean },
): CampaignStarVisualState {
  if (node.kind === "anchor") {
    return {
      prominence: "anchor",
      brightness: Math.max(1, node.brightness),
      haloRadius: 40,
      bloomStrength: Math.max(0.96, node.glow),
      lineOpacity: 0.38,
      hovered: options?.hovered ?? false,
      selected: options?.selected ?? false,
    };
  }

  const base = VISUALS_BY_PROMINENCE[node.prominence];

  return {
    ...base,
    brightness: Math.max(base.brightness, node.brightness),
    bloomStrength: Math.max(base.bloomStrength, node.glow),
    hovered: options?.hovered ?? false,
    selected: options?.selected ?? false,
  };
}
