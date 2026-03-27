import type { TranscriptHeartbeatPanel as TranscriptPanelData } from "@/lib/types/meepoSnapshot";

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  healthy: { color: "bg-green-700/50 text-green-300", label: "Healthy" },
  stale: { color: "bg-amber-700/50 text-amber-300", label: "Stale" },
  silent: { color: "bg-zinc-700/50 text-zinc-400", label: "Silent" },
};

export function TranscriptHeartbeatPanel({ data, rangeLabel }: { data: TranscriptPanelData; rangeLabel?: string }) {
  const statusStyle = STATUS_STYLES[data.status] ?? STATUS_STYLES.silent;

  return (
    <section className="rounded-xl border border-border/60 bg-background/60 p-5 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Spoken Transcript
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            Inbound speech + Meepo spoken replies{rangeLabel ? ` \u00b7 ${rangeLabel}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${statusStyle.color}`}>
            {statusStyle.label}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {/* Stats row */}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>
            Last spoken:{" "}
            {data.lastSpokenLineAt ? formatRelativeTime(data.lastSpokenLineAt) : "never"}
          </span>
          <span>{data.spokenLineCount} lines</span>
          {data.lastCaptureAt && data.lastCaptureAt !== data.lastSpokenLineAt && (
            <span>Capture: {formatRelativeTime(data.lastCaptureAt)}</span>
          )}
        </div>

        {/* Recent excerpts */}
        {data.recentExcerpts.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {rangeLabel ? `No spoken lines in the ${rangeLabel.toLowerCase()} window.` : "No spoken lines."}
          </p>
        ) : (
          <div className="space-y-1.5">
            {data.recentExcerpts.map((excerpt, i) => (
              <div key={`${excerpt.timestampMs}-${i}`} className="text-sm">
                <span
                  className={
                    excerpt.role === "meepo"
                      ? "font-medium text-primary/80"
                      : "font-medium text-foreground/70"
                  }
                >
                  {excerpt.authorName}:
                </span>{" "}
                <span className="text-foreground/60">{excerpt.content}</span>
                <span className="ml-2 text-xs text-zinc-600">{formatRelativeTime(excerpt.timestampMs)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function formatRelativeTime(ms: number): string {
  const delta = Date.now() - ms;
  if (delta < 1_000) return "now";
  if (delta < 60_000) return `${Math.floor(delta / 1_000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return `${Math.floor(delta / 3_600_000)}h ago`;
}
