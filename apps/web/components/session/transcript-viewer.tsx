"use client";

import { useMemo, useState } from "react";
import { StatusChip } from "@/components/shared/status-chip";
import type { TranscriptEntry } from "@/lib/types";

type TranscriptViewerProps = {
  entries: TranscriptEntry[];
  status?: "available" | "missing" | "unavailable";
  warnings?: string[];
};

const CHUNK_SIZE = 300;

export function TranscriptViewer({ entries, status = "available", warnings = [] }: TranscriptViewerProps) {
  const [visibleCount, setVisibleCount] = useState(CHUNK_SIZE);
  const visibleEntries = useMemo(() => entries.slice(0, visibleCount), [entries, visibleCount]);
  const hasMore = visibleCount < entries.length;

  return (
    <div className="rounded-2xl card-glass">
      <div className="space-y-2 border-b border-border px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-serif text-lg">Transcript</h3>
          <StatusChip label={`${entries.length} lines`} tone="info" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label={status === "available" ? "Transcript ready" : `Transcript ${status}`} tone={status === "available" ? "success" : status === "unavailable" ? "danger" : "warning"} />
          {warnings.length > 0 ? <StatusChip label="Warnings present" tone="warning" /> : null}
        </div>
      </div>
      <div className="custom-scrollbar max-h-[70vh] space-y-5 overflow-y-auto p-6">
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
              onClick={() => setVisibleCount((current) => Math.min(current + CHUNK_SIZE, entries.length))}
              className="w-full rounded-full border border-border bg-background/35 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              Load {Math.min(CHUNK_SIZE, entries.length - visibleCount)} more lines
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
