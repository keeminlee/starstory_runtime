// ── Meepo Runtime Snapshot DTO ─────────────────────────────
// Consumed by GET /api/dev/meepo-snapshot and the dev dashboard UI.

export type LifecycleState = "Dormant" | "Awakened" | "Showtime";

export type TimeRange = "today" | "7d" | "30d" | "all";

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "Forever",
};

export function isTimeRange(value: string): value is TimeRange {
  return value === "today" || value === "7d" || value === "30d" || value === "all";
}

/** Compute the lower-bound timestamp for a time range. Returns 0 for "all". */
export function rangeToSinceMs(range: TimeRange, nowMs: number = Date.now()): number {
  switch (range) {
    case "today": {
      const d = new Date(nowMs);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }
    case "7d":
      return nowMs - 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return nowMs - 30 * 24 * 60 * 60 * 1000;
    case "all":
      return 0;
  }
}

export type MeepoRuntimeSnapshot = {
  guildId: string;
  campaignSlug: string;
  fetchedAt: number;

  runtime: RuntimePanel;
  recentEvents: RecentEventsPanel;
  context: ContextPanel;
  transcriptHeartbeat: TranscriptHeartbeatPanel;
  debugScope?: DebugScope;
};

// ── Debug scope provenance (dev-only) ─────────────────────

export type DebugScope = {
  resolvedGuildId: string;
  resolvedCampaignSlug: string | null;
  resolvedSessionId: string | null;
  slugSource: "route-param" | "control-db-lookup" | "none";
  usedCompatibilityPath: boolean;
  // Filter provenance
  selectedRange: TimeRange | null;
  computedSinceMs: number | null;
  timeFilterAppliesTo: readonly string[];
  liveRuntimeCampaignSlug: string | null;
};

// ── Runtime panel ─────────────────────────────────────────

export type RuntimePanel = {
  lifecycleState: LifecycleState;
  effectiveMode: string | null;
  voiceConnected: boolean;
  voiceChannelId: string | null;
  sttEnabled: boolean;
  hushEnabled: boolean;
  activeSessionId: string | null;
  activeSessionLabel: string | null;
  activePersonaId: string | null;
  personaLabel: string | null;
  formId: string | null;
  contextWorkerRunning: boolean;
  contextQueueQueued: number;
  contextQueueFailed: number;
  heartbeatUpdatedAt: number | null;
  heartbeatStale: boolean;
};

// ── Recent Events panel ───────────────────────────────────

export type MeepoInteractionEvent = {
  tier: string;
  triggerKind: string;
  speakerName: string | null;
  replyExcerpt: string | null;
  timestampMs: number;
};

export type RecentEventsPanel = {
  interactions: MeepoInteractionEvent[];
};

// ── Context panel ─────────────────────────────────────────

export type ConvoTurn = {
  role: string;
  authorName: string;
  content: string;
  timestampMs: number;
};

export type ContextPanel = {
  personaId: string | null;
  personaLabel: string | null;
  personaScope: string | null;
  convoTail: ConvoTurn[];
  contextTokenEstimate: number | null;
  contextWatermark: number | null;
  contextLineTotal: number | null;
  queueSummary: {
    pending: number;
    processing: number;
    failed: number;
    oldestPendingAgeMs: number | null;
    lastCompletedAtMs: number | null;
  } | null;
};

// ── Transcript Heartbeat panel ────────────────────────────

export type TranscriptExcerpt = {
  authorName: string;
  content: string;
  timestampMs: number;
  /** "human" = inbound STT, "meepo" = outbound Meepo spoken voice */
  role: "human" | "meepo";
};

export type TranscriptHeartbeatPanel = {
  /** Timestamp of the latest spoken line (human or Meepo) */
  lastSpokenLineAt: number | null;
  /** Timestamp of the latest inbound human voice capture (drives health badge) */
  lastCaptureAt: number | null;
  recentExcerpts: TranscriptExcerpt[];
  /** Total spoken lines (both human inbound + Meepo outbound) */
  spokenLineCount: number;
  /** Health badge: tied to inbound capture freshness only */
  status: "healthy" | "stale" | "silent";
};
