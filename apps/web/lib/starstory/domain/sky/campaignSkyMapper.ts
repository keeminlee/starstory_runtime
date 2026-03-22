import type { CampaignSummary, HomepageSkyPersonalAnchorStarSummary, HomepageSkyProjection, SessionSummary } from "@/lib/types";
import type { CampaignVisibleNode, ObserverSkyModel, SkyLink, SkyStarNode, StarProminence } from "./skyObserverTypes";

const NODE_VERTICAL_SPACING = 6;
const CANVAS_TOP_PADDING = 8;
const CANVAS_BOTTOM_PADDING = 10;
const MIN_CANVAS_HEIGHT = 80;

type SkySessionLike = Pick<SessionSummary, "id" | "label" | "title" | "date">;

type SkyCampaignLike = Pick<CampaignSummary, "slug" | "name" | "sessionCount" | "lastSessionDate"> & {
  id: string;
  guildIconUrl?: string | null;
  sessions: SkySessionLike[];
};

type CampaignSkyModelOptions = {
  enableDiagnostics?: boolean;
};

function logCampaignSkyDiagnostics(enabled: boolean | undefined, event: string, context: Record<string, unknown>): void {
  if (!enabled) {
    return;
  }

  console.info(`[homepage-sky] ${event}`, context);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashValue(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function sortSessions<T extends SkySessionLike>(sessions: T[]): T[] {
  return [...sessions].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    return left.id.localeCompare(right.id);
  });
}

function toProminence(order: number, totalVisible: number): StarProminence {
  if (totalVisible <= 1) {
    return "anchor";
  }

  if (order === totalVisible - 1) {
    return "anchor";
  }

  if (order === 0 || (totalVisible >= 4 && order === Math.floor(totalVisible / 2))) {
    return "major";
  }

  return "minor";
}

function buildVisibleNodes(
  campaign: SkyCampaignLike,
): CampaignVisibleNode[] {
  const sortedSessions = sortSessions(campaign.sessions);

  return sortedSessions.map((session, visibleIndex) => {
    const prominence = toProminence(visibleIndex, sortedSessions.length);

    return {
      id: `${campaign.id}:${session.id}`,
      campaignId: campaign.id,
      campaignSlug: campaign.slug,
      campaignName: campaign.name,
      guildIconUrl: campaign.guildIconUrl ?? null,
      sessionId: session.id,
      sessionTitle: session.title,
      sessionCount: campaign.sessionCount,
      order: visibleIndex,
      prominence,
      label: session.label?.trim() || session.title,
    };
  });
}

function buildCampaignLinks(nodes: CampaignVisibleNode[]): SkyLink[] {
  const links: SkyLink[] = [];

  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1]!;
    const current = nodes[index]!;

    links.push({
      id: `${previous.id}->${current.id}`,
      from: previous.id,
      to: current.id,
      campaignId: current.campaignId,
    });
  }

  return links;
}

function buildPersonalAnchorNode(anchorStar: HomepageSkyPersonalAnchorStarSummary | null): SkyStarNode | null {
  if (!anchorStar) {
    return null;
  }

  return {
    id: `anchor::${anchorStar.sessionId}`,
    kind: "anchor",
    plane: "anchor",
    x: 50,
    y: 42,
    size: 1.2,
    brightness: 1,
    glow: 1,
    prominence: "anchor",
    campaignId: `${anchorStar.guildId}::${anchorStar.campaignSlug}`,
    campaignSlug: anchorStar.campaignSlug,
    campaignName: anchorStar.campaignName,
    guildIconUrl: anchorStar.guildIconUrl ?? null,
    sessionId: anchorStar.sessionId,
    sessionTitle: anchorStar.sessionLabel?.trim() || anchorStar.campaignName,
    sessionCount: 1,
    label: anchorStar.sessionLabel?.trim() || "Your star",
  };
}

export function buildCampaignSkyModel(
  model: Pick<HomepageSkyProjection, "campaigns" | "personalAnchorStar">,
  options?: CampaignSkyModelOptions,
): ObserverSkyModel {
  const campaigns = [...model.campaigns]
    .filter((campaign) => campaign.sessions.length > 0)
    .sort((left, right) => {
      const rightDate = right.lastSessionDate ?? "";
      const leftDate = left.lastSessionDate ?? "";
      if (rightDate !== leftDate) {
        return rightDate.localeCompare(leftDate);
      }

      return left.name.localeCompare(right.name);
    });

  const columns = Math.max(1, Math.min(campaigns.length, Math.ceil(Math.sqrt(campaigns.length || 1))));
  const columnWidth = 100 / columns;

  const nodes: SkyStarNode[] = [];
  const links: SkyLink[] = [];
  const personalAnchorNode = buildPersonalAnchorNode(model.personalAnchorStar);

  // Track the bottom Y per column slot for stacking campaigns vertically
  const columnBottoms = new Array<number>(columns).fill(CANVAS_TOP_PADDING);
  let maxY = 0;

  campaigns.forEach((campaign, campaignIndex) => {
    // Interleaved placement: assign to whichever column currently has the least content
    const col = columnBottoms.reduce((minCol, val, idx) =>
      val < columnBottoms[minCol]! ? idx : minCol, 0);

    const campaignHash = hashValue(campaign.id);
    const columnLeft = col * columnWidth;
    // Hex offset: odd physical rows shift by half a column width
    const isOddRow = Math.floor(campaignIndex / columns) % 2 === 1;
    const hexOffset = isOddRow ? columnWidth * 0.35 : 0;
    const centerX = clamp(
      columnLeft + columnWidth * 0.5 + hexOffset + ((campaignHash % 7) - 3) * 0.6,
      6, 94,
    );
    const visibleNodes = buildVisibleNodes(campaign);
    const linksForCampaign = buildCampaignLinks(visibleNodes);

    const startY = columnBottoms[col]!;

    visibleNodes.forEach((visibleNode, nodeIndex) => {
      const localHash = hashValue(visibleNode.id);
      const jitterX = (((localHash >> 5) % 7) - 3) * 0.5;
      const jitterY = (((localHash >> 8) % 5) - 2) * 0.3;
      const x = clamp(centerX + jitterX, 6, 94);
      const y = startY + (nodeIndex * NODE_VERTICAL_SPACING) + jitterY;
      const baseSize = visibleNode.prominence === "anchor" ? 1 : visibleNode.prominence === "major" ? 0.8 : 0.62;
      const baseBrightness = visibleNode.prominence === "anchor" ? 1 : visibleNode.prominence === "major" ? 0.86 : 0.72;
      const baseGlow = visibleNode.prominence === "anchor" ? 0.88 : visibleNode.prominence === "major" ? 0.72 : 0.56;

      nodes.push({
        id: visibleNode.id,
        kind: "session",
        plane: "constellation",
        x,
        y,
        size: baseSize,
        brightness: baseBrightness,
        glow: baseGlow,
        prominence: visibleNode.prominence,
        campaignId: visibleNode.campaignId,
        campaignSlug: visibleNode.campaignSlug,
        campaignName: visibleNode.campaignName,
        guildIconUrl: visibleNode.guildIconUrl ?? null,
        sessionId: visibleNode.sessionId,
        sessionTitle: visibleNode.sessionTitle,
        sessionCount: visibleNode.sessionCount,
        label: visibleNode.label,
      });

      maxY = Math.max(maxY, y);
    });

    // Update column bottom to account for this campaign's nodes + inter-campaign gap
    const lastNodeY = startY + ((visibleNodes.length - 1) * NODE_VERTICAL_SPACING);
    columnBottoms[col] = lastNodeY + NODE_VERTICAL_SPACING * 1.5;

    links.push(...linksForCampaign);
  });

  const contentHeight = Math.max(MIN_CANVAS_HEIGHT, maxY + CANVAS_BOTTOM_PADDING);

  return {
    nodes,
    links,
    personalAnchorNode,
    contentHeight,
  };
}
