import type { RuntimePanel as RuntimePanelData } from "@/lib/types/meepoSnapshot";

const LIFECYCLE_COLORS: Record<string, string> = {
  Dormant: "bg-zinc-600/60 text-zinc-300",
  Awakened: "bg-amber-700/50 text-amber-300",
  Showtime: "bg-green-700/50 text-green-300",
};

function Badge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${className ?? "bg-zinc-700/50 text-zinc-300"}`}>
      {label}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate text-right text-foreground/90">{children}</span>
    </div>
  );
}

export function RuntimePanel({ data, campaignMismatch }: { data: RuntimePanelData; campaignMismatch?: string | null }) {
  const lifecycleColor = LIFECYCLE_COLORS[data.lifecycleState] ?? LIFECYCLE_COLORS.Dormant;

  return (
    <section className="rounded-xl border border-border/60 bg-background/60 p-5 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground">Runtime</h2>
        <div className="flex items-center gap-2">
          <Badge label={data.lifecycleState} className={lifecycleColor} />
          {data.heartbeatStale && (
            <Badge label="Stale" className="bg-red-700/40 text-red-300" />
          )}
        </div>
      </div>

      {campaignMismatch && (
        <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
          {campaignMismatch}
        </div>
      )}

      <div className="space-y-2">
        <Row label="Mode">{data.effectiveMode ?? "—"}</Row>
        <Row label="Voice">
          {data.voiceConnected ? (
            <span className="text-green-400">{data.voiceChannelId ?? "connected"}</span>
          ) : (
            <span className="text-zinc-500">disconnected</span>
          )}
        </Row>
        <Row label="STT">{data.sttEnabled ? "enabled" : "disabled"}</Row>
        {data.hushEnabled && <Row label="Hush"><span className="text-amber-400">active</span></Row>}
        <Row label="Session">
          {data.activeSessionId ? (
            <span title={data.activeSessionId}>
              {data.activeSessionLabel ?? data.activeSessionId.slice(0, 8)}
            </span>
          ) : (
            <span className="text-zinc-500">none</span>
          )}
        </Row>
        <Row label="Persona">
          {data.personaLabel ?? data.activePersonaId ?? "—"}
        </Row>
        {data.formId && data.formId !== "meepo" && (
          <Row label="Form">{data.formId}</Row>
        )}
        <Row label="Context Worker">
          {data.contextWorkerRunning ? (
            <span className="text-green-400">running</span>
          ) : (
            <span className="text-zinc-500">stopped</span>
          )}
        </Row>
        {(data.contextQueueQueued > 0 || data.contextQueueFailed > 0) && (
          <Row label="Queue">
            {data.contextQueueQueued} queued
            {data.contextQueueFailed > 0 && (
              <span className="text-red-400"> / {data.contextQueueFailed} failed</span>
            )}
          </Row>
        )}
        {data.heartbeatUpdatedAt && (
          <Row label="Heartbeat">{formatRelativeTime(data.heartbeatUpdatedAt)}</Row>
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
