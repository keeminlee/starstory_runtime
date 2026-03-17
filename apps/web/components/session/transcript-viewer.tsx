"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusChip } from "@/components/shared/status-chip";
import { getSessionTranscriptApi } from "@/lib/api/sessions";
import type { TranscriptEntry } from "@/lib/types";

type TranscriptViewerProps = {
  entries: TranscriptEntry[];
  sessionId: string;
  sessionTitle: string;
  campaignSlug: string;
  sessionStatus?: "completed" | "in_progress" | "interrupted";
  status?: "available" | "missing" | "unavailable";
  warnings?: string[];
  searchParams?: Record<string, string | string[] | undefined>;
  emptyDescription?: string;
};

const CHUNK_SIZE = 300;
const POLL_INTERVAL_MS = 5000;

function isNearBottom(container: HTMLDivElement): boolean {
  return container.scrollHeight - container.scrollTop - container.clientHeight < 48;
}

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toTranscriptTxt(args: {
  entries: TranscriptEntry[];
  sessionId: string;
  sessionTitle: string;
  campaignSlug: string;
}): string {
  const title = args.sessionTitle.trim().length > 0 ? args.sessionTitle : "Untitled Session";
  const header = [
    `Session: ${title}`,
    `Session ID: ${args.sessionId}`,
    `Campaign: ${args.campaignSlug}`,
    "",
  ];

  const lines = args.entries.map((entry) => `[${entry.timestamp}] ${entry.speaker}: ${entry.text}`);
  return [...header, ...lines].join("\n");
}

export function TranscriptViewer({
  entries,
  sessionId,
  sessionTitle,
  campaignSlug,
  sessionStatus = "completed",
  status = "available",
  warnings = [],
  searchParams,
  emptyDescription = "No transcript has been recorded for this session yet.",
}: TranscriptViewerProps) {
  const scopedSearchParams = useMemo(
    () => ({
      ...searchParams,
      campaign_slug: campaignSlug,
    }),
    [campaignSlug, searchParams]
  );
  const [transcriptEntries, setTranscriptEntries] = useState(entries);
  const [transcriptStatus, setTranscriptStatus] = useState(status);
  const [transcriptWarnings, setTranscriptWarnings] = useState(warnings);
  const [liveSessionStatus, setLiveSessionStatus] = useState(sessionStatus);
  const [visibleCount, setVisibleCount] = useState(Math.max(CHUNK_SIZE, entries.length));
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(entries.length === 0);
  const latestEntriesRef = useRef(entries);

  useEffect(() => {
    const previousLength = latestEntriesRef.current.length;
    setTranscriptEntries(entries);
    setTranscriptStatus(status);
    setTranscriptWarnings(warnings);
    setLiveSessionStatus(sessionStatus);
    setVisibleCount((current) => {
      const nextBase = Math.max(CHUNK_SIZE, entries.length);
      return current >= previousLength ? nextBase : Math.min(current, entries.length);
    });
    latestEntriesRef.current = entries;
  }, [entries, sessionStatus, status, warnings]);

  useEffect(() => {
    latestEntriesRef.current = transcriptEntries;
  }, [transcriptEntries]);

  useEffect(() => {
    if (liveSessionStatus !== "in_progress") {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      const container = scrollContainerRef.current;
      const shouldStick = container ? isNearBottom(container) : latestEntriesRef.current.length === 0;

      try {
        const result = await getSessionTranscriptApi(sessionId, scopedSearchParams);
        if (cancelled) {
          return;
        }

        setTranscriptEntries(result.transcript);
        setTranscriptStatus(result.status);
        setTranscriptWarnings(result.warnings);
        setLiveSessionStatus(result.sessionStatus);
        setVisibleCount((current) => {
          const previousLength = latestEntriesRef.current.length;
          const wasShowingAll = current >= previousLength;
          if (shouldStick || wasShowingAll) {
            return Math.max(CHUNK_SIZE, result.transcript.length);
          }
          return Math.min(current, result.transcript.length);
        });
        stickToBottomRef.current = shouldStick;

        if (result.sessionStatus !== "in_progress") {
          return;
        }
      } catch {
        // Keep the last successful transcript in view; polling can resume on the next interval.
      }

      if (!cancelled) {
        timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [liveSessionStatus, scopedSearchParams, sessionId]);

  useEffect(() => {
    if (!stickToBottomRef.current) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
    stickToBottomRef.current = false;
  }, [transcriptEntries, visibleCount]);

  const visibleEntries = useMemo(
    () => transcriptEntries.slice(0, visibleCount),
    [transcriptEntries, visibleCount]
  );
  const hasMore = visibleCount < transcriptEntries.length;
  const transcriptBaseName = `${campaignSlug}-${sessionId}-transcript`;

  return (
    <div className="rounded-2xl card-glass">
      <div className="space-y-2 border-b border-border px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-serif text-lg">Transcript</h3>
          <div className="flex items-center gap-2">
            <StatusChip label={`${transcriptEntries.length} lines`} tone="info" />
            {liveSessionStatus === "in_progress" ? <StatusChip label="Live" tone="warning" /> : null}
            <button
              type="button"
              onClick={() =>
                triggerDownload(
                  `${transcriptBaseName}.txt`,
                  toTranscriptTxt({ entries: transcriptEntries, sessionId, sessionTitle, campaignSlug }),
                  "text/plain;charset=utf-8"
                )
              }
              disabled={transcriptEntries.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          </div>
        </div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {transcriptStatus === "available"
            ? liveSessionStatus === "in_progress"
              ? "Transcript live-refreshing every 5 seconds"
              : "Transcript ready"
            : `Transcript ${transcriptStatus}`}
        </p>
        {transcriptWarnings.length > 0 ? <p className="text-xs text-amber-200/90">Warnings: {transcriptWarnings[0]}</p> : null}
      </div>
      <div
        ref={scrollContainerRef}
        onScroll={() => {
          const container = scrollContainerRef.current;
          if (container) {
            stickToBottomRef.current = isNearBottom(container);
          }
        }}
        className="custom-scrollbar max-h-[70vh] space-y-5 overflow-y-auto p-6"
      >
        {visibleEntries.length > 0 ? (
          <>
            {visibleEntries.map((entry) => (
              <article key={entry.id} className="group space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">{entry.speaker}</span>
                  <span className="text-[10px] text-muted-foreground/50">{entry.timestamp}</span>
                </div>
                <p className="border-l border-border/60 pl-4 text-sm leading-relaxed break-words text-foreground/85">
                  {entry.text}
                </p>
              </article>
            ))}
            {hasMore ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((current) => Math.min(current + CHUNK_SIZE, transcriptEntries.length))
                  }
                  className="w-full rounded-full border border-border bg-background/35 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  Load {Math.min(CHUNK_SIZE, transcriptEntries.length - visibleCount)} more lines
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            title={
              liveSessionStatus === "in_progress"
                ? "Transcript in progress"
                : transcriptStatus === "missing"
                  ? "No transcript yet"
                  : "Transcript unavailable"
            }
            description={emptyDescription}
          />
        )}
      </div>
    </div>
  );
}
