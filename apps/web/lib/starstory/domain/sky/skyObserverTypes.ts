export type StarProminence = "minor" | "major" | "anchor";

export type SkyNodePlane = "constellation" | "anchor";

export type SkyStarNode = {
  id: string;
  kind: "ambient" | "session" | "anchor";
  plane: SkyNodePlane;
  x: number;
  y: number;
  size: number;
  brightness: number;
  glow: number;
  prominence: StarProminence;
  campaignId?: string;
  campaignSlug?: string;
  campaignName?: string;
  guildIconUrl?: string | null;
  sessionId?: string;
  sessionTitle?: string;
  sessionCount?: number;
  label?: string;
};

export type SkyLink = {
  id: string;
  from: string;
  to: string;
  campaignId: string;
};

export type CampaignVisibleNode = {
  id: string;
  campaignId: string;
  campaignSlug: string;
  campaignName: string;
  guildIconUrl?: string | null;
  sessionId: string;
  sessionTitle: string;
  sessionCount: number;
  order: number;
  prominence: StarProminence;
  label: string;
};

export type ObserverSkyModel = {
  nodes: SkyStarNode[];
  links: SkyLink[];
  personalAnchorNode: SkyStarNode | null;
  /** Virtual canvas height in the same coordinate units as node y values (x is always 0–100). */
  contentHeight: number;
};
