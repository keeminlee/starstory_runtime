"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { EntityAppearanceDto, RegistryCategoryKey } from "@/lib/registry/types";
import { getEntityAppearancesApi } from "@/lib/api/registry";

type AnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type Props = {
  entityId: string;
  entityName: string;
  category: RegistryCategoryKey;
  campaignSlug: string;
  anchorRect: AnchorRect;
  isPinned: boolean;
  searchParams?: Record<string, string | string[] | undefined>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClose: () => void;
};

const CATEGORY_LABELS: Record<RegistryCategoryKey, string> = {
  pcs: "Player Character",
  npcs: "NPC",
  locations: "Location",
  factions: "Faction",
  misc: "Misc",
};

export function EntityPreviewPanel({
  entityId,
  entityName,
  category,
  campaignSlug,
  anchorRect,
  isPinned,
  searchParams,
  onMouseEnter,
  onMouseLeave,
  onClose,
}: Props) {
  const [appearances, setAppearances] = useState<EntityAppearanceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [viewport, setViewport] = useState({ width: 1440, height: 900 });

  const panelWidth = 360;
  const panelHeight = 340;
  const viewportPadding = 16;

  useEffect(() => {
    setIsMounted(true);

    function syncViewport() {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const resp = await getEntityAppearancesApi(
          campaignSlug,
          entityId,
          searchParams as Record<string, string | string[] | undefined>
        );
        if (!cancelled) {
          setAppearances(resp.appearances);
        }
      } catch {
        if (!cancelled) {
          setAppearances([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [entityId, campaignSlug, searchParams]);

  const { panelStyle, arrowStyle } = useMemo(() => {
    const width = Math.min(panelWidth, viewport.width - viewportPadding * 2);
    const anchorCenter = anchorRect.left + anchorRect.width / 2;
    const unclampedLeft = anchorCenter - width / 2;
    const left = Math.min(
      Math.max(unclampedLeft, viewportPadding),
      Math.max(viewportPadding, viewport.width - width - viewportPadding)
    );
    const top = Math.min(
      Math.max(anchorRect.bottom + 12, viewportPadding),
      Math.max(viewportPadding, viewport.height - panelHeight - viewportPadding)
    );
    const arrowLeft = Math.min(
      Math.max(anchorCenter - left, 20),
      Math.max(20, width - 20)
    );

    return {
      panelStyle: {
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
      },
      arrowStyle: {
        left: `${arrowLeft}px`,
      },
    };
  }, [anchorRect.bottom, anchorRect.left, anchorRect.right, viewport.height, viewport.width]);

  if (!isMounted) {
    return null;
  }

  return createPortal(
    <div
      className="fixed z-[9999]"
      style={panelStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/30 bg-background/95 shadow-2xl backdrop-blur-lg">
        <div
          className="absolute top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-amber-400/30 bg-background/95"
          style={arrowStyle}
        />
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-serif text-base text-amber-300">{entityName}</h3>
              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {isPinned ? "Pinned" : "Preview"}
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {CATEGORY_LABELS[category]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label={isPinned ? "Close pinned entity preview" : "Close entity preview"}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[22rem] overflow-y-auto p-4 space-y-4">
          <div>
            <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Sessions Appeared In
            </h4>
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : appearances.length === 0 ? (
              <p className="text-xs text-muted-foreground">No session appearances recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {appearances.map((a) => (
                  <div
                    key={a.sessionId}
                    className="rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate font-semibold text-foreground">
                        {a.sessionLabel ?? a.sessionId.slice(0, 8)}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{a.sessionDate}</span>
                    </div>
                    {a.excerpt && (
                      <p className="mt-1 text-[10px] italic text-muted-foreground line-clamp-2">
                        {a.excerpt}
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] text-amber-400/70">
                      {a.mentionCount} mention{a.mentionCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border/40 pt-3">
            <a
              href={`/campaigns/${encodeURIComponent(campaignSlug)}?tab=compendium`}
              className="text-[10px] font-bold uppercase tracking-wider text-amber-400 hover:text-amber-300"
            >
              Open in Compendium →
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
