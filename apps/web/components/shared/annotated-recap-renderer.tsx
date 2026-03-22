"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import { parseRecapBlocks } from "@/components/chronicle/recap-body-renderer";
import { EntityPreviewPanel } from "@/components/session/entity-preview-panel";
import {
  overlayChronicleRecapSpans,
  overlayChronicleText,
  type ChronicleDisplaySpan,
} from "@/lib/chronicle/recapEntityOverlay";
import type { AnnotatedRecapLine } from "@/lib/types";
import type { EntityCandidateDto, RegistryCategoryKey, RegistrySnapshotDto } from "@/lib/registry/types";

const HOVER_OPEN_DELAY_MS = 180;
const HOVER_CLOSE_DELAY_MS = 120;

type AnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type PreviewEntityState = {
  entityId: string;
  entityName: string;
  category: RegistryCategoryKey;
  anchorRect: AnchorRect;
};

type AnnotatedRecapRendererProps = {
  annotatedLines: AnnotatedRecapLine[] | null;
  text: string;
  campaignSlug: string;
  searchParams?: Record<string, string | string[] | undefined>;
  candidates?: EntityCandidateDto[];
  registry?: RegistrySnapshotDto | null;
};

function getAnchorRect(target: HTMLElement): AnchorRect {
  const rect = target.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

export function AnnotatedRecapRenderer({
  annotatedLines,
  text,
  campaignSlug,
  searchParams,
  candidates,
  registry,
}: AnnotatedRecapRendererProps) {
  const [hoverPreview, setHoverPreview] = useState<PreviewEntityState | null>(null);
  const [pinnedPreview, setPinnedPreview] = useState<PreviewEntityState | null>(null);
  const hoverOpenRef = useRef<number | null>(null);
  const hoverCloseRef = useRef<number | null>(null);

  const activePreview = pinnedPreview ?? hoverPreview;

  const displayLines = useMemo(() => {
    if (!annotatedLines) return null;
    return annotatedLines.map((line) => ({
      ...line,
      displaySpans: overlayChronicleRecapSpans({
        spans: line.spans,
        registry,
        candidates,
      }),
    }));
  }, [annotatedLines, candidates, registry]);

  const plainBlocks = useMemo(() => {
    if (displayLines) {
      return null;
    }

    return parseRecapBlocks(text).map((block) => {
      if (block.type === "paragraph") {
        return {
          type: "paragraph" as const,
          spans: overlayChronicleText({ text: block.text, registry, candidates }),
        };
      }

      return {
        type: block.type,
        items: block.items.map((item) => overlayChronicleText({ text: item, registry, candidates })),
      };
    });
  }, [candidates, displayLines, registry, text]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (hoverOpenRef.current !== null) window.clearTimeout(hoverOpenRef.current);
      if (hoverCloseRef.current !== null) window.clearTimeout(hoverCloseRef.current);
    };
  }, []);

  function clearHoverOpen() {
    if (hoverOpenRef.current !== null) {
      window.clearTimeout(hoverOpenRef.current);
      hoverOpenRef.current = null;
    }
  }

  function clearHoverClose() {
    if (hoverCloseRef.current !== null) {
      window.clearTimeout(hoverCloseRef.current);
      hoverCloseRef.current = null;
    }
  }

  function scheduleClose() {
    clearHoverClose();
    hoverCloseRef.current = window.setTimeout(() => {
      setHoverPreview(null);
      hoverCloseRef.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  }

  function handleEntityMouseEnter(
    target: HTMLElement,
    entityId: string,
    entityName: string,
    category: RegistryCategoryKey
  ) {
    if (pinnedPreview) return;
    clearHoverClose();
    clearHoverOpen();
    hoverOpenRef.current = window.setTimeout(() => {
      setHoverPreview({ entityId, entityName, category, anchorRect: getAnchorRect(target) });
      hoverOpenRef.current = null;
    }, HOVER_OPEN_DELAY_MS);
  }

  function handleEntityMouseLeave() {
    if (pinnedPreview) return;
    clearHoverOpen();
    scheduleClose();
  }

  function handleEntityClick(
    target: HTMLElement,
    entityId: string,
    entityName: string,
    category: RegistryCategoryKey
  ) {
    clearHoverOpen();
    clearHoverClose();
    const preview: PreviewEntityState = {
      entityId,
      entityName,
      category,
      anchorRect: getAnchorRect(target),
    };
    setHoverPreview(preview);
    setPinnedPreview((current) => {
      if (current && current.entityId === entityId) return null;
      return preview;
    });
  }

  function handlePreviewClose() {
    clearHoverOpen();
    clearHoverClose();
    setHoverPreview(null);
    setPinnedPreview(null);
  }

  function renderSpan(span: ChronicleDisplaySpan, key: number) {
    if (span.type === "entity") {
      return (
        <button
          key={key}
          type="button"
          onMouseEnter={(e) =>
            handleEntityMouseEnter(e.currentTarget, span.entityId, span.text, span.category)
          }
          onMouseLeave={handleEntityMouseLeave}
          onClick={(e) =>
            handleEntityClick(e.currentTarget, span.entityId, span.text, span.category)
          }
          className="cursor-pointer font-medium text-amber-300/95 transition-colors hover:text-amber-200 focus:outline-none focus-visible:text-amber-200"
        >
          {span.text}
        </button>
      );
    }

    if (span.type === "candidate") {
      return (
        <span
          key={key}
          className="font-medium text-sky-100/80"
          title={`Unresolved candidate: ${span.candidateName}`}
        >
          {span.text}
        </span>
      );
    }

    return <span key={key}>{span.text}</span>;
  }

  return (
    <div className="relative">
      <div className="space-y-6 text-[15px] leading-8 text-foreground/92">
        {displayLines
          ? displayLines.map((line, index) => (
              <p key={`annotated-${index}`} className="max-w-none whitespace-pre-wrap text-pretty">
                {line.displaySpans.map((span, si) => renderSpan(span, si))}
              </p>
            ))
          : plainBlocks?.map((block, index) => {
              if (block.type === "paragraph") {
                return (
                  <p key={`paragraph-${index}`} className="max-w-none whitespace-pre-wrap text-pretty">
                    {block.spans.map((span, spanIndex) => renderSpan(span, spanIndex))}
                  </p>
                );
              }

              if (block.type === "ordered-list") {
                return (
                  <ol key={`ordered-${index}`} className="list-decimal space-y-3 pl-6 marker:text-foreground/55">
                    {block.items.map((item, itemIndex) => (
                      <li key={`ordered-${index}-${itemIndex}`} className="pl-1">
                        {item.map((span, spanIndex) => renderSpan(span, spanIndex))}
                      </li>
                    ))}
                  </ol>
                );
              }

              return (
                <ul key={`unordered-${index}`} className="list-disc space-y-3 pl-6 marker:text-foreground/55">
                  {block.items.map((item, itemIndex) => (
                    <li key={`unordered-${index}-${itemIndex}`} className="pl-1">
                      {item.map((span, spanIndex) => renderSpan(span, spanIndex))}
                    </li>
                  ))}
                </ul>
              );
            })}
      </div>

      {activePreview ? (
        <EntityPreviewPanel
          entityId={activePreview.entityId}
          entityName={activePreview.entityName}
          category={activePreview.category}
          campaignSlug={campaignSlug}
          anchorRect={activePreview.anchorRect}
          isPinned={Boolean(pinnedPreview)}
          searchParams={searchParams}
          onMouseEnter={() => clearHoverClose()}
          onMouseLeave={() => {
            if (!pinnedPreview) scheduleClose();
          }}
          onClose={handlePreviewClose}
        />
      ) : null}
    </div>
  );
}
