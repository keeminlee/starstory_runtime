import type { RecentEventsPanel as RecentEventsPanelData } from "@/lib/types/meepoSnapshot";

const TIER_COLORS: Record<string, string> = {
  S: "text-amber-300",
  A: "text-green-300",
  B: "text-zinc-300",
  C: "text-zinc-500",
};

export function RecentEventsPanel({ data, rangeLabel }: { data: RecentEventsPanelData; rangeLabel?: string }) {
  return (
    <section className="rounded-xl border border-border/60 bg-background/60 p-5 backdrop-blur">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Events
        </h2>
        {rangeLabel && (
          <span className="text-xs text-muted-foreground/70">{rangeLabel}</span>
        )}
      </div>

      {data.interactions.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {rangeLabel ? `No interactions in the ${rangeLabel.toLowerCase()} window.` : "No recent interactions."}
        </p>
      ) : (
        <div className="space-y-2">
          {data.interactions.map((event, i) => (
            <div
              key={`${event.timestampMs}-${i}`}
              className="flex items-start gap-3 rounded-lg border border-border/30 bg-background/40 px-3 py-2 text-sm"
            >
              <span className={`shrink-0 font-mono font-bold ${TIER_COLORS[event.tier] ?? "text-zinc-400"}`}>
                {event.tier}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-foreground/80">
                    {event.triggerKind}
                    {event.speakerName && (
                      <span className="text-muted-foreground"> &middot; {event.speakerName}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {formatRelativeTime(event.timestampMs)}
                  </span>
                </div>
                {event.replyExcerpt && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.replyExcerpt}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
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
