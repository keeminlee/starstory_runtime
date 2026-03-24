"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useVerboseMode } from "@/providers/verbose-mode-provider";
import { useActiveCampaignScope, useCampaignContext } from "@/components/providers/campaign-context-provider";
import type { MeepoRuntimeSnapshot } from "@/lib/types/meepoSnapshot";
import { type TimeRange, TIME_RANGE_LABELS, isTimeRange } from "@/lib/types/meepoSnapshot";
import { RuntimePanel } from "@/components/dev/panels/runtime-panel";
import { RecentEventsPanel } from "@/components/dev/panels/recent-events-panel";
import { ContextPanel } from "@/components/dev/panels/context-panel";
import { TranscriptHeartbeatPanel } from "@/components/dev/panels/transcript-heartbeat-panel";

const POLL_INTERVAL_MS = 5_000;
const DEFAULT_RANGE: TimeRange = "7d";

export function MeepoDashboard() {
  const { verboseModeEnabled, hasHydrated } = useVerboseMode();
  const { slug: ctxSlug, guildId: ctxGuildId } = useActiveCampaignScope();
  const { realCampaigns } = useCampaignContext();
  const searchParams = useSearchParams();
  const router = useRouter();

  // ── URL-backed state ─────────────────────────────────────
  const rawRange = searchParams.get("range") ?? DEFAULT_RANGE;
  const range: TimeRange = isTimeRange(rawRange) ? rawRange : DEFAULT_RANGE;
  const urlCampaignSlug = searchParams.get("campaign_slug");
  // Use URL campaign_slug if explicitly set, otherwise fall back to context
  const campaignSlug = urlCampaignSlug ?? ctxSlug;
  const guildId = ctxGuildId;

  const setUrlParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  const [snapshot, setSnapshot] = useState<MeepoRuntimeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSnapshot = useCallback(async () => {
    if (!guildId) return;
    try {
      const params = new URLSearchParams({ guild_id: guildId, range });
      if (campaignSlug) params.set("campaign_slug", campaignSlug);

      const res = await fetch(`/api/dev/meepo-snapshot?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? `HTTP ${res.status}`);
        setSnapshot(null);
        return;
      }
      const data = (await res.json()) as MeepoRuntimeSnapshot;
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setSnapshot(null);
    }
  }, [guildId, campaignSlug, range]);

  // Polling loop
  useEffect(() => {
    if (!hasHydrated || !verboseModeEnabled || !guildId) return;

    setPolling(true);
    fetchSnapshot();

    const id = setInterval(fetchSnapshot, POLL_INTERVAL_MS);
    timerRef.current = id;

    return () => {
      clearInterval(id);
      timerRef.current = null;
      setPolling(false);
    };
  }, [hasHydrated, verboseModeEnabled, guildId, fetchSnapshot]);

  // Detect campaign mismatch
  const liveSlug = snapshot?.debugScope?.liveRuntimeCampaignSlug ?? null;
  const campaignMismatch =
    campaignSlug && liveSlug && campaignSlug !== liveSlug
      ? `Viewing ${campaignSlug} but runtime is running ${liveSlug}`
      : null;

  const rangeLabel = TIME_RANGE_LABELS[range];

  // Gate: verbose mode required
  if (!hasHydrated) {
    return <GateMessage message="Loading..." />;
  }

  if (!verboseModeEnabled) {
    return (
      <GateMessage message="Enable verbose mode to access the runtime inspector. Toggle it via the version badge at the bottom-left." />
    );
  }

  if (!guildId) {
    return <GateMessage message="No active guild. Select a campaign first." />;
  }

  return (
    <div className="space-y-6 pb-16">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold text-foreground/90">Runtime Inspector</h1>

          {/* Campaign selector */}
          {realCampaigns.length > 1 && (
            <select
              value={campaignSlug ?? ""}
              onChange={(e) => {
                const val = e.target.value || null;
                setUrlParam("campaign_slug", val);
              }}
              className="control-select h-7 rounded border border-border/60 bg-background/60 px-2 text-xs text-foreground/80"
            >
              {realCampaigns.map((c) => (
                <option key={c.scopeKey} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {/* Time range segmented control */}
          <div className="flex rounded-md border border-border/60 bg-background/40 text-xs">
            {(Object.entries(TIME_RANGE_LABELS) as [TimeRange, string][]).map(
              ([key, label]) => (
                <button
                  key={key}
                  onClick={() => setUrlParam("range", key === DEFAULT_RANGE ? null : key)}
                  className={`px-2.5 py-1 transition-colors ${
                    range === key
                      ? "bg-primary/20 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground/80"
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Dev-only live snapshot &middot;{" "}
          {polling ? (
            <span className="text-green-400/80">Polling every 5s</span>
          ) : (
            <span className="text-amber-400/80">Paused</span>
          )}
          {snapshot && (
            <>
              {" "}&middot; {snapshot.campaignSlug}
            </>
          )}
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {snapshot ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <RuntimePanel data={snapshot.runtime} campaignMismatch={campaignMismatch} />
          <RecentEventsPanel data={snapshot.recentEvents} rangeLabel={rangeLabel} />
          <ContextPanel data={snapshot.context} isFiltered={range !== "all"} />
          <TranscriptHeartbeatPanel data={snapshot.transcriptHeartbeat} rangeLabel={rangeLabel} />
        </div>
      ) : !error ? (
        <div className="text-sm text-muted-foreground">Loading snapshot...</div>
      ) : null}

      {snapshot?.debugScope && (
        <details className="mt-4 rounded-lg border border-border/40 bg-background/40 p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-mono">Scope Provenance</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(snapshot.debugScope, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function GateMessage({ message }: { message: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="max-w-md text-center text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
