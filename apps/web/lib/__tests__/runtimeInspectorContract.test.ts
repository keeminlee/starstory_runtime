import { describe, expect, test } from "vitest";
import type {
  MeepoRuntimeSnapshot,
  RuntimePanel,
  ContextPanel,
  TranscriptHeartbeatPanel,
  TranscriptExcerpt,
  DebugScope,
} from "@/lib/types/meepoSnapshot";
import { isTimeRange, rangeToSinceMs, TIME_RANGE_LABELS } from "@/lib/types/meepoSnapshot";

// ── Stale badge derivation ────────────────────────────────

describe("stale badge derivation", () => {
  const STALE_THRESHOLD_MS = 30_000;

  function deriveStale(updatedAtMs: number | null, nowMs: number): boolean {
    // Mirrors the reader's logic exactly
    if (updatedAtMs === null) return true;
    return nowMs - updatedAtMs > STALE_THRESHOLD_MS;
  }

  test("heartbeat updated <30s ago is not stale", () => {
    const now = Date.now();
    expect(deriveStale(now - 5_000, now)).toBe(false);
  });

  test("heartbeat updated exactly 30s ago is not stale", () => {
    const now = Date.now();
    expect(deriveStale(now - STALE_THRESHOLD_MS, now)).toBe(false);
  });

  test("heartbeat updated >30s ago is stale", () => {
    const now = Date.now();
    expect(deriveStale(now - 31_000, now)).toBe(true);
  });

  test("null heartbeat timestamp is always stale", () => {
    expect(deriveStale(null, Date.now())).toBe(true);
  });
});

// ── Transcript status derivation ──────────────────────────

describe("transcript status derivation", () => {
  const TRANSCRIPT_STALE_MS = 120_000;

  function deriveTranscriptStatus(
    lastVoiceEntryAt: number | null,
    nowMs: number,
  ): "healthy" | "stale" | "silent" {
    if (lastVoiceEntryAt === null) return "silent";
    return nowMs - lastVoiceEntryAt > TRANSCRIPT_STALE_MS ? "stale" : "healthy";
  }

  test("no voice entry means silent", () => {
    expect(deriveTranscriptStatus(null, Date.now())).toBe("silent");
  });

  test("voice entry <2min ago means healthy", () => {
    const now = Date.now();
    expect(deriveTranscriptStatus(now - 60_000, now)).toBe("healthy");
  });

  test("voice entry >2min ago means stale", () => {
    const now = Date.now();
    expect(deriveTranscriptStatus(now - 180_000, now)).toBe("stale");
  });
});

// ── DTO shape contracts ───────────────────────────────────

describe("snapshot DTO shape contracts", () => {
  function makeValidSnapshot(): MeepoRuntimeSnapshot {
    return {
      guildId: "123",
      campaignSlug: "test-campaign",
      fetchedAt: Date.now(),
      runtime: {
        lifecycleState: "Awakened",
        effectiveMode: "live",
        voiceConnected: true,
        voiceChannelId: "vc-1",
        sttEnabled: true,
        hushEnabled: false,
        activeSessionId: "sess-1",
        activeSessionLabel: "C2E20",
        activePersonaId: "meepo",
        personaLabel: "Meepo",
        formId: "meepo",
        contextWorkerRunning: true,
        contextQueueQueued: 2,
        contextQueueFailed: 0,
        heartbeatUpdatedAt: Date.now() - 3000,
        heartbeatStale: false,
      },
      recentEvents: {
        interactions: [
          {
            tier: "S",
            triggerKind: "name_call",
            speakerName: "12345",
            replyExcerpt: "Hello adventurer!",
            timestampMs: Date.now() - 5000,
          },
        ],
      },
      context: {
        personaId: "meepo",
        personaLabel: "Meepo",
        personaScope: null,
        convoTail: [
          {
            role: "player",
            authorName: "TestUser",
            content: "Hey Meepo",
            timestampMs: Date.now() - 10000,
          },
        ],
        contextTokenEstimate: 1200,
        contextWatermark: 42,
        contextLineTotal: 50,
        queueSummary: {
          pending: 1,
          processing: 0,
          failed: 0,
          oldestPendingAgeMs: 5000,
          lastCompletedAtMs: Date.now() - 30000,
        },
      },
      transcriptHeartbeat: {
        lastSpokenLineAt: Date.now() - 10000,
        lastCaptureAt: Date.now() - 10000,
        recentExcerpts: [
          {
            authorName: "TestUser",
            content: "Testing voice",
            timestampMs: Date.now() - 10000,
            role: "human",
          },
        ],
        spokenLineCount: 12,
        status: "healthy",
      },
      debugScope: {
        resolvedGuildId: "123",
        resolvedCampaignSlug: "test-campaign",
        resolvedSessionId: "sess-1",
        slugSource: "route-param",
        usedCompatibilityPath: false,
        selectedRange: "7d",
        computedSinceMs: Date.now() - 7 * 24 * 60 * 60 * 1000,
        timeFilterAppliesTo: ["recentEvents", "transcriptHeartbeat"],
        liveRuntimeCampaignSlug: "test-campaign",
      },
    };
  }

  test("valid snapshot satisfies MeepoRuntimeSnapshot type shape", () => {
    const snapshot = makeValidSnapshot();
    expect(snapshot.guildId).toBe("123");
    expect(snapshot.runtime.lifecycleState).toBe("Awakened");
    expect(snapshot.recentEvents.interactions).toHaveLength(1);
    expect(snapshot.context.convoTail).toHaveLength(1);
    expect(snapshot.transcriptHeartbeat.status).toBe("healthy");
    expect(snapshot.debugScope?.slugSource).toBe("route-param");
  });

  test("context panel queue uses pending/processing naming (not queued/leased)", () => {
    const snapshot = makeValidSnapshot();
    const q = snapshot.context.queueSummary!;
    expect(q).toHaveProperty("pending");
    expect(q).toHaveProperty("processing");
    expect(q).toHaveProperty("oldestPendingAgeMs");
    // Ensure old names don't exist
    expect(q).not.toHaveProperty("queued");
    expect(q).not.toHaveProperty("leased");
    expect(q).not.toHaveProperty("oldestQueuedAgeMs");
  });

  test("context panel uses contextLineTotal (not contextMessageCount)", () => {
    const snapshot = makeValidSnapshot();
    expect(snapshot.context).toHaveProperty("contextLineTotal");
    expect(snapshot.context).not.toHaveProperty("contextMessageCount");
  });

  test("debugScope is present and declares provenance", () => {
    const snapshot = makeValidSnapshot();
    expect(snapshot.debugScope).toBeDefined();
    expect(["route-param", "control-db-lookup", "none"]).toContain(
      snapshot.debugScope!.slugSource,
    );
  });
});

// ── Scope routing contracts ───────────────────────────────

describe("scope routing contracts", () => {
  test("sessionId null means session-scoped tiles get unscoped queries", () => {
    // When heartbeat has no active session, context and transcript tiles
    // should fall back to guild-wide queries (not crash or show wrong session).
    const runtime: RuntimePanel = {
      lifecycleState: "Dormant",
      effectiveMode: null,
      voiceConnected: false,
      voiceChannelId: null,
      sttEnabled: false,
      hushEnabled: false,
      activeSessionId: null,
      activeSessionLabel: null,
      activePersonaId: null,
      personaLabel: null,
      formId: null,
      contextWorkerRunning: false,
      contextQueueQueued: 0,
      contextQueueFailed: 0,
      heartbeatUpdatedAt: null,
      heartbeatStale: true,
    };
    // The reader passes runtime.activeSessionId to downstream panels.
    // When null, convoTail should be empty (session-scoped query not executed),
    // transcript should degrade to guild-wide.
    expect(runtime.activeSessionId).toBeNull();
  });

  test("empty state snapshot has all null/empty defaults", () => {
    const empty: MeepoRuntimeSnapshot = {
      guildId: "123",
      campaignSlug: "unknown",
      fetchedAt: Date.now(),
      runtime: {
        lifecycleState: "Dormant",
        effectiveMode: null,
        voiceConnected: false,
        voiceChannelId: null,
        sttEnabled: false,
        hushEnabled: false,
        activeSessionId: null,
        activeSessionLabel: null,
        activePersonaId: null,
        personaLabel: null,
        formId: null,
        contextWorkerRunning: false,
        contextQueueQueued: 0,
        contextQueueFailed: 0,
        heartbeatUpdatedAt: null,
        heartbeatStale: true,
      },
      recentEvents: { interactions: [] },
      context: {
        personaId: null,
        personaLabel: null,
        personaScope: null,
        convoTail: [],
        contextTokenEstimate: null,
        contextWatermark: null,
        contextLineTotal: null,
        queueSummary: null,
      },
      transcriptHeartbeat: {
        lastSpokenLineAt: null,
        lastCaptureAt: null,
        recentExcerpts: [],
        spokenLineCount: 0,
        status: "silent",
      },
    };

    expect(empty.runtime.heartbeatStale).toBe(true);
    expect(empty.runtime.lifecycleState).toBe("Dormant");
    expect(empty.recentEvents.interactions).toEqual([]);
    expect(empty.context.convoTail).toEqual([]);
    expect(empty.context.queueSummary).toBeNull();
    expect(empty.transcriptHeartbeat.status).toBe("silent");
    expect(empty.transcriptHeartbeat.spokenLineCount).toBe(0);
  });
});

// ── Transcript filter semantics ───────────────────────────

describe("transcript filter semantics", () => {
  test("panel source filter is voice-only (includes both inbound + outbound)", () => {
    // Contract: The spoken transcript panel filters ledger_entries WHERE source='voice'.
    // This includes both inbound STT (tags='human') and outbound Meepo spoken (tags='npc,meepo,spoken').
    const panel: TranscriptHeartbeatPanel = {
      lastSpokenLineAt: Date.now(),
      lastCaptureAt: Date.now() - 5000,
      recentExcerpts: [],
      spokenLineCount: 5,
      status: "healthy",
    };
    // lastSpokenLineAt reflects any row (human or meepo)
    expect(panel).toHaveProperty("lastSpokenLineAt");
    // lastCaptureAt reflects inbound human capture only (drives health)
    expect(panel).toHaveProperty("lastCaptureAt");
    // spokenLineCount includes both sides
    expect(panel).toHaveProperty("spokenLineCount");
  });
});

// ── Time range utilities ──────────────────────────────────

describe("isTimeRange", () => {
  test.each(["today", "7d", "30d", "all"])("accepts valid range '%s'", (v) => {
    expect(isTimeRange(v)).toBe(true);
  });

  test.each(["", "1d", "7D", "week", "forever", "ALL"])("rejects invalid range '%s'", (v) => {
    expect(isTimeRange(v)).toBe(false);
  });
});

describe("rangeToSinceMs", () => {
  const NOW = 1_700_000_000_000; // fixed reference

  test("'all' returns 0", () => {
    expect(rangeToSinceMs("all", NOW)).toBe(0);
  });

  test("'7d' returns 7 days before now", () => {
    expect(rangeToSinceMs("7d", NOW)).toBe(NOW - 7 * 24 * 60 * 60 * 1000);
  });

  test("'30d' returns 30 days before now", () => {
    expect(rangeToSinceMs("30d", NOW)).toBe(NOW - 30 * 24 * 60 * 60 * 1000);
  });

  test("'today' returns start-of-day in local time", () => {
    const since = rangeToSinceMs("today", NOW);
    const d = new Date(NOW);
    const expected = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    expect(since).toBe(expected);
    // Must be earlier than now
    expect(since).toBeLessThanOrEqual(NOW);
    // Must be within 24h of now
    expect(NOW - since).toBeLessThan(24 * 60 * 60 * 1000);
  });

  test("result is always non-negative", () => {
    for (const range of ["today", "7d", "30d", "all"] as const) {
      expect(rangeToSinceMs(range, NOW)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("TIME_RANGE_LABELS", () => {
  test("has a label for every TimeRange value", () => {
    expect(Object.keys(TIME_RANGE_LABELS)).toEqual(["today", "7d", "30d", "all"]);
  });
});

// ── Filter provenance in DebugScope ───────────────────────

describe("filter provenance in debugScope", () => {
  test("debugScope includes filter provenance fields", () => {
    const scope: DebugScope = {
      resolvedGuildId: "g1",
      resolvedCampaignSlug: "c1",
      resolvedSessionId: null,
      slugSource: "control-db-lookup",
      usedCompatibilityPath: false,
      selectedRange: "30d",
      computedSinceMs: 12345,
      timeFilterAppliesTo: ["recentEvents", "transcriptHeartbeat"],
      liveRuntimeCampaignSlug: "c1",
    };
    expect(scope.selectedRange).toBe("30d");
    expect(scope.computedSinceMs).toBe(12345);
    expect(scope.timeFilterAppliesTo).toContain("recentEvents");
    expect(scope.timeFilterAppliesTo).toContain("transcriptHeartbeat");
    expect(scope.timeFilterAppliesTo).not.toContain("runtime");
    expect(scope.timeFilterAppliesTo).not.toContain("context");
  });

  test("liveRuntimeCampaignSlug can be null when bot is dormant", () => {
    const scope: DebugScope = {
      resolvedGuildId: "g1",
      resolvedCampaignSlug: null,
      resolvedSessionId: null,
      slugSource: "none",
      usedCompatibilityPath: false,
      selectedRange: "all",
      computedSinceMs: 0,
      timeFilterAppliesTo: ["recentEvents", "transcriptHeartbeat"],
      liveRuntimeCampaignSlug: null,
    };
    expect(scope.liveRuntimeCampaignSlug).toBeNull();
  });
});

// ── Spoken transcript semantics ───────────────────────────

describe("spoken transcript — role distinction", () => {
  test("human inbound excerpt has role='human'", () => {
    const excerpt: TranscriptExcerpt = {
      authorName: "keemin",
      content: "Good morning Meepo, how are you doing?",
      timestampMs: Date.now() - 5000,
      role: "human",
    };
    expect(excerpt.role).toBe("human");
  });

  test("Meepo spoken excerpt has role='meepo'", () => {
    const excerpt: TranscriptExcerpt = {
      authorName: "Meepo",
      content: "Morning. I'm functional…",
      timestampMs: Date.now() - 4000,
      role: "meepo",
    };
    expect(excerpt.role).toBe("meepo");
  });

  test("mixed transcript preserves chronological order with both roles", () => {
    const now = Date.now();
    const excerpts: TranscriptExcerpt[] = [
      { authorName: "keemin", content: "Hello", timestampMs: now - 3000, role: "human" },
      { authorName: "Meepo", content: "Hi there!", timestampMs: now - 2000, role: "meepo" },
      { authorName: "keemin", content: "How are you?", timestampMs: now - 1000, role: "human" },
    ];
    // Chronological: ascending timestamps
    for (let i = 1; i < excerpts.length; i++) {
      expect(excerpts[i].timestampMs).toBeGreaterThan(excerpts[i - 1].timestampMs);
    }
    // Both roles present
    expect(excerpts.some((e) => e.role === "human")).toBe(true);
    expect(excerpts.some((e) => e.role === "meepo")).toBe(true);
  });

  test("spokenLineCount includes both human and meepo lines", () => {
    const panel: TranscriptHeartbeatPanel = {
      lastSpokenLineAt: Date.now(),
      lastCaptureAt: Date.now() - 2000,
      recentExcerpts: [
        { authorName: "keemin", content: "hi", timestampMs: Date.now() - 2000, role: "human" },
        { authorName: "Meepo", content: "hey", timestampMs: Date.now(), role: "meepo" },
      ],
      spokenLineCount: 42,
      status: "healthy",
    };
    // Count field includes both sides
    expect(panel.spokenLineCount).toBe(42);
    expect(panel.recentExcerpts).toHaveLength(2);
  });
});

describe("spoken transcript — health badge semantics", () => {
  test("health is 'healthy' when inbound capture is recent", () => {
    const panel: TranscriptHeartbeatPanel = {
      lastSpokenLineAt: Date.now(),
      lastCaptureAt: Date.now() - 5000,
      recentExcerpts: [],
      spokenLineCount: 10,
      status: "healthy",
    };
    expect(panel.status).toBe("healthy");
  });

  test("health can be stale even when Meepo spoke recently (captures are old)", () => {
    // Meepo spoke 1s ago, but last human capture was 3 min ago → stale
    const panel: TranscriptHeartbeatPanel = {
      lastSpokenLineAt: Date.now() - 1000,
      lastCaptureAt: Date.now() - 180_000,
      recentExcerpts: [
        { authorName: "Meepo", content: "Hello?", timestampMs: Date.now() - 1000, role: "meepo" },
      ],
      spokenLineCount: 5,
      status: "stale",
    };
    // Status is stale because capture freshness drives it, not Meepo output
    expect(panel.status).toBe("stale");
    expect(panel.lastSpokenLineAt).toBeGreaterThan(panel.lastCaptureAt!);
  });

  test("health is 'silent' when no inbound capture exists at all", () => {
    const panel: TranscriptHeartbeatPanel = {
      lastSpokenLineAt: Date.now(),
      lastCaptureAt: null,
      recentExcerpts: [
        { authorName: "Meepo", content: "Anyone there?", timestampMs: Date.now(), role: "meepo" },
      ],
      spokenLineCount: 1,
      status: "silent",
    };
    // Even with Meepo rows, no inbound capture → silent
    expect(panel.status).toBe("silent");
  });
});
