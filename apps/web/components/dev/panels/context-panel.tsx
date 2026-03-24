import type { ContextPanel as ContextPanelData } from "@/lib/types/meepoSnapshot";

export function ContextPanel({ data, isFiltered }: { data: ContextPanelData; isFiltered?: boolean }) {
  return (
    <section className="rounded-xl border border-border/60 bg-background/60 p-5 backdrop-blur">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Context Snapshot
        </h2>
        {isFiltered && (
          <span className="text-xs text-muted-foreground/60">Live &middot; not time-filtered</span>
        )}
      </div>

      <div className="space-y-4">
        {/* Persona */}
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Persona</span>
          <p className="mt-1 text-sm text-foreground/90">
            {data.personaLabel ?? data.personaId ?? "—"}
            {data.personaScope && (
              <span className="ml-2 text-xs text-muted-foreground">({data.personaScope})</span>
            )}
          </p>
        </div>

        {/* Context metadata */}
        {(data.contextTokenEstimate !== null || data.contextWatermark !== null) && (
          <div className="flex gap-4 text-xs text-muted-foreground">
            {data.contextTokenEstimate !== null && (
              <span>~{data.contextTokenEstimate} tokens</span>
            )}
            {data.contextWatermark !== null && (
              <span>watermark: {data.contextWatermark}</span>
            )}
            {data.contextLineTotal !== null && (
              <span>{data.contextLineTotal} lines</span>
            )}
          </div>
        )}

        {/* Queue summary */}
        {data.queueSummary && (data.queueSummary.pending > 0 || data.queueSummary.failed > 0) && (
          <div className="rounded-md border border-border/30 bg-background/30 px-3 py-2 text-xs text-muted-foreground">
            <span>Queue: {data.queueSummary.pending} pending</span>
            {data.queueSummary.processing > 0 && <span> / {data.queueSummary.processing} in-flight</span>}
            {data.queueSummary.failed > 0 && <span className="text-red-400"> / {data.queueSummary.failed} failed</span>}
            {data.queueSummary.oldestPendingAgeMs !== null && (
              <span> / oldest: {formatDuration(data.queueSummary.oldestPendingAgeMs)}</span>
            )}
          </div>
        )}

        {/* Convo tail */}
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recent Conversation ({data.convoTail.length} turns)
          </span>
          {data.convoTail.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-500">No conversation log.</p>
          ) : (
            <div className="mt-2 max-h-60 space-y-1.5 overflow-y-auto custom-scrollbar">
              {data.convoTail.map((turn, i) => (
                <div key={`${turn.timestampMs}-${i}`} className="text-sm">
                  <span className={turn.role === "assistant" ? "font-medium text-primary/80" : "font-medium text-foreground/70"}>
                    {turn.authorName}:
                  </span>{" "}
                  <span className="text-foreground/60">{turn.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.floor(ms / 1_000)}s`;
  return `${Math.floor(ms / 60_000)}m`;
}
