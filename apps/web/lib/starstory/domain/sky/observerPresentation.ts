import type { SkyStarNode, StarProminence } from "./skyObserverTypes";

export type ObserverNavigationIntent = "dashboard" | "session" | "none";

export type ObserverStarPresentation = {
  starId: string;
  campaignId?: string;
  displayKind: "ambient" | "session" | "anchor";
  glyph: string;
  guildIconUrl?: string;
  obscuredTitle?: string;
  hintText?: string;
  actionText?: string;
  prominence: StarProminence;
  isOwnStar: boolean;
  isViewerOwned: boolean;
  isActionable: boolean;
  navigationIntent: ObserverNavigationIntent;
  href?: string;
};

type ObserverPresentationOptions = Record<string, never>;

const OBSERVER_GLYPHS = ["☉", "☽", "✦", "✧", "✶", "◇", "◈", "⟡", "☌", "☍"] as const;

function hashValue(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function buildSessionHref(node: SkyStarNode): string | undefined {
  const campaignSlug = node.campaignSlug?.trim();
  const sessionId = node.sessionId?.trim();
  if (!campaignSlug || !sessionId) {
    return undefined;
  }

  // Decode any pre-encoded values to avoid double-encoding, then encode for URL
  const slug = decodeURIComponent(campaignSlug);
  const sid = decodeURIComponent(sessionId);
  return `/campaigns/${encodeURIComponent(slug)}/sessions/${encodeURIComponent(sid)}`;
}

function buildReadableTitle(node: SkyStarNode, isOwnStar: boolean): string | undefined {
  if (node.kind === "anchor") {
    return isOwnStar ? "Your Star" : "Anchor star";
  }

  return node.sessionTitle?.trim() || node.label?.trim() || node.campaignName?.trim();
}

function buildReadableHint(node: SkyStarNode, isOwnStar: boolean): string | undefined {
  if (node.kind === "anchor") {
    return isOwnStar ? "Your story lives here" : "A personal star answers here";
  }

  if (node.kind === "session") {
    return node.campaignName?.trim() ? `chronicle · ${node.campaignName.trim()}` : "chronicle";
  }

  if (!node.sessionCount || node.sessionCount <= 0) {
    return undefined;
  }

  if (node.sessionCount === 1) {
    return "one echo";
  }

  return `${node.sessionCount} echoes`;
}

function buildNavigation(node: SkyStarNode, isOwnStar: boolean): {
  navigationIntent: ObserverNavigationIntent;
  href?: string;
} {
  if (node.kind === "anchor" && isOwnStar) {
    return {
      navigationIntent: "dashboard",
      href: "/dashboard",
    };
  }

  const href = buildSessionHref(node);
  if (href) {
    return {
      navigationIntent: "session",
      href,
    };
  }

  return {
    navigationIntent: "none",
  };
}

function buildActionText(args: {
  navigationIntent: ObserverNavigationIntent;
}): string | undefined {
  if (args.navigationIntent === "dashboard") {
    return "Step into the Chronicle";
  }

  if (args.navigationIntent === "session") {
    return "Open this Chronicle";
  }

  return undefined;
}

export function buildObserverStarPresentations(
  nodes: SkyStarNode[],
  options?: ObserverPresentationOptions,
): ObserverStarPresentation[] {
  return nodes.map((node) => {
    const isOwnStar = node.kind === "anchor";
    const isViewerOwned = isOwnStar;
    const glyph = isOwnStar
      ? "✺"
      : OBSERVER_GLYPHS[hashValue(node.campaignId ?? node.id) % OBSERVER_GLYPHS.length] ?? "✦";
    const navigation = buildNavigation(node, isOwnStar);
    const actionText = buildActionText({
      navigationIntent: navigation.navigationIntent,
    });

    return {
      starId: node.id,
      campaignId: node.campaignId,
      displayKind: node.kind,
      glyph,
      guildIconUrl: node.guildIconUrl ?? undefined,
      obscuredTitle:
        node.kind === "session" || node.kind === "anchor"
          ? buildReadableTitle(node, isOwnStar)
          : undefined,
      hintText:
        node.kind === "session" || node.kind === "anchor"
          ? buildReadableHint(node, isOwnStar)
          : undefined,
      actionText,
      prominence: node.prominence,
      isOwnStar,
      isViewerOwned,
      isActionable: navigation.navigationIntent !== "none",
      navigationIntent: navigation.navigationIntent,
      href: navigation.href,
    };
  });
}
