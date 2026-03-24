/**
 * Meepo runtime snapshot reader.
 * Read-only queries against the campaign DB for the dev dashboard.
 *
 * Source contracts (see docs/notes/runtime-inspector-source-map.md):
 *   Runtime panel  → bot_runtime_heartbeat (exclusively)
 *   Recent Events  → meepo_interactions (interaction-centric, guild-scoped)
 *   Context        → guild_runtime_state + bot_runtime_heartbeat + meepo_convo_log + meepo_context + meepo_actions
 *   Transcript     → ledger_entries WHERE source='voice' (inbound STT + outbound Meepo spoken, session-scoped when available)
 */

import type {
  MeepoRuntimeSnapshot,
  RuntimePanel,
  RecentEventsPanel,
  ContextPanel,
  TranscriptHeartbeatPanel,
  MeepoInteractionEvent,
  ConvoTurn,
  TranscriptExcerpt,
  LifecycleState,
  DebugScope,
  TimeRange,
} from "@/lib/types/meepoSnapshot";
import { getGuildCampaignSlug } from "@/lib/server/readData/archiveReadStore";
import { getDbForCampaignScope } from "../../../../src/db";

// ── Helpers ───────────────────────────────────────────────

function tableExists(db: any, tableName: string): boolean {
  const tables = db.pragma("table_list") as any[];
  return tables.some((t: any) => t.name === tableName);
}

function safeGet<T>(db: any, sql: string, ...params: any[]): T | undefined {
  try {
    return db.prepare(sql).get(...params) as T | undefined;
  } catch {
    return undefined;
  }
}

function safeAll<T>(db: any, sql: string, ...params: any[]): T[] {
  try {
    return db.prepare(sql).all(...params) as T[];
  } catch {
    return [];
  }
}

// ── Runtime panel ─────────────────────────────────────────
// Source: bot_runtime_heartbeat (exclusively)

const HEARTBEAT_STALE_MS = 30_000;

function readRuntimePanel(db: any, guildId: string): RuntimePanel {
  const now = Date.now();

  if (!tableExists(db, "bot_runtime_heartbeat")) {
    return emptyRuntimePanel();
  }

  const row = safeGet<any>(
    db,
    "SELECT * FROM bot_runtime_heartbeat WHERE guild_id = ? LIMIT 1",
    guildId,
  );

  if (!row) return emptyRuntimePanel();

  const updatedAt: number | null = row.updated_at_ms ?? null;
  const stale = updatedAt !== null ? now - updatedAt > HEARTBEAT_STALE_MS : true;

  return {
    lifecycleState: (row.lifecycle_state as LifecycleState) ?? "Dormant",
    effectiveMode: row.effective_mode ?? null,
    voiceConnected: Boolean(row.voice_connected),
    voiceChannelId: row.voice_channel_id ?? null,
    sttEnabled: Boolean(row.stt_enabled),
    hushEnabled: Boolean(row.hush_enabled),
    activeSessionId: row.active_session_id ?? null,
    activeSessionLabel: row.active_session_label ?? null,
    activePersonaId: row.active_persona_id ?? null,
    personaLabel: row.persona_label ?? null,
    formId: row.form_id ?? null,
    contextWorkerRunning: Boolean(row.context_worker_running),
    contextQueueQueued: row.context_queue_queued ?? 0,
    contextQueueFailed: row.context_queue_failed ?? 0,
    heartbeatUpdatedAt: updatedAt,
    heartbeatStale: stale,
  };
}

function emptyRuntimePanel(): RuntimePanel {
  return {
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
}

// ── Recent Events panel ───────────────────────────────────
// Source: meepo_interactions (interaction-centric)
// Columns: tier, trigger (not trigger_kind), speaker_id (not speaker_name),
//          meta_json (contains voice_reply_content_snippet), created_at_ms

function readRecentEventsPanel(db: any, guildId: string, sinceMs: number): RecentEventsPanel {
  if (!tableExists(db, "meepo_interactions")) {
    return { interactions: [] };
  }

  const timeClause = sinceMs > 0 ? "AND created_at_ms >= ?" : "";
  const params: any[] = sinceMs > 0 ? [guildId, sinceMs] : [guildId];

  const rows = safeAll<any>(
    db,
    `SELECT tier, trigger, speaker_id, meta_json, created_at_ms
     FROM meepo_interactions
     WHERE guild_id = ? ${timeClause}
     ORDER BY created_at_ms DESC
     LIMIT 20`,
    ...params,
  );

  const interactions: MeepoInteractionEvent[] = rows.map((r) => {
    let replyExcerpt: string | null = null;
    if (r.meta_json) {
      try {
        const meta = JSON.parse(r.meta_json);
        replyExcerpt = meta.voice_reply_content_snippet
          ? String(meta.voice_reply_content_snippet).slice(0, 120)
          : null;
      } catch { /* malformed meta_json — skip */ }
    }
    return {
      tier: r.tier ?? "unknown",
      triggerKind: r.trigger ?? "unknown",
      speakerName: r.speaker_id ?? null,
      replyExcerpt,
      timestampMs: r.created_at_ms ?? 0,
    };
  });

  return { interactions };
}

// ── Context panel ─────────────────────────────────────────
// Sources: guild_runtime_state, bot_runtime_heartbeat, meepo_convo_log,
//          meepo_context, meepo_actions

function readContextPanel(db: any, guildId: string, sessionId: string | null): ContextPanel {
  // Persona info from guild_runtime_state
  let personaId: string | null = null;
  let personaLabel: string | null = null;
  let personaScope: string | null = null;

  if (tableExists(db, "guild_runtime_state")) {
    const row = safeGet<any>(
      db,
      "SELECT active_persona_id FROM guild_runtime_state WHERE guild_id = ? LIMIT 1",
      guildId,
    );
    personaId = row?.active_persona_id ?? null;
  }

  // Read from heartbeat for persona label (already resolved there)
  if (tableExists(db, "bot_runtime_heartbeat")) {
    const hb = safeGet<any>(
      db,
      "SELECT active_persona_id, persona_label FROM bot_runtime_heartbeat WHERE guild_id = ? LIMIT 1",
      guildId,
    );
    if (hb) {
      personaId = personaId ?? hb.active_persona_id ?? null;
      personaLabel = hb.persona_label ?? null;
    }
  }

  // Convo tail from meepo_convo_log (session-scoped)
  // Actual columns: speaker_name (not author_name), content_raw / content_norm (not content)
  const convoTail: ConvoTurn[] = [];
  if (sessionId && tableExists(db, "meepo_convo_log")) {
    const rows = safeAll<any>(
      db,
      `SELECT role, speaker_name, COALESCE(content_norm, content_raw) AS content, ts_ms
       FROM meepo_convo_log
       WHERE session_id = ?
       ORDER BY ts_ms DESC
       LIMIT 20`,
      sessionId,
    );
    for (const r of rows.reverse()) {
      convoTail.push({
        role: r.role ?? "unknown",
        authorName: r.speaker_name ?? "?",
        content: r.content ?? "",
        timestampMs: r.ts_ms ?? 0,
      });
    }
  }

  // Context metadata from meepo_context (session-scoped when available)
  // Actual columns: token_estimate, canon_line_cursor_watermark (not watermark),
  //                 canon_line_cursor_total (no message_count column exists)
  let contextTokenEstimate: number | null = null;
  let contextWatermark: number | null = null;
  let contextLineTotal: number | null = null;

  if (tableExists(db, "meepo_context")) {
    const ctxParams: any[] = sessionId ? [guildId, sessionId] : [guildId];
    const sessionClause = sessionId ? "AND session_id = ?" : "";
    const ctx = safeGet<any>(
      db,
      `SELECT token_estimate, canon_line_cursor_watermark, canon_line_cursor_total
       FROM meepo_context
       WHERE guild_id = ? ${sessionClause}
       ORDER BY updated_at_ms DESC
       LIMIT 1`,
      ...ctxParams,
    );
    if (ctx) {
      contextTokenEstimate = ctx.token_estimate ?? null;
      contextWatermark = ctx.canon_line_cursor_watermark ?? null;
      contextLineTotal = ctx.canon_line_cursor_total ?? null;
    }
  }

  // Queue summary from meepo_actions
  // Actual status values: 'pending' (not 'queued'), 'processing' (not 'leased'), 'done', 'failed'
  let queueSummary: ContextPanel["queueSummary"] = null;
  if (tableExists(db, "meepo_actions")) {
    const now = Date.now();
    const pending = safeGet<any>(db, "SELECT COUNT(*) as cnt FROM meepo_actions WHERE guild_id = ? AND status = 'pending'", guildId);
    const processing = safeGet<any>(db, "SELECT COUNT(*) as cnt FROM meepo_actions WHERE guild_id = ? AND status = 'processing'", guildId);
    const failed = safeGet<any>(db, "SELECT COUNT(*) as cnt FROM meepo_actions WHERE guild_id = ? AND status = 'failed'", guildId);
    const oldest = safeGet<any>(db, "SELECT MIN(created_at_ms) as ms FROM meepo_actions WHERE guild_id = ? AND status = 'pending'", guildId);
    const lastDone = safeGet<any>(db, "SELECT MAX(completed_at_ms) as ms FROM meepo_actions WHERE guild_id = ? AND status = 'done'", guildId);

    queueSummary = {
      pending: pending?.cnt ?? 0,
      processing: processing?.cnt ?? 0,
      failed: failed?.cnt ?? 0,
      oldestPendingAgeMs: oldest?.ms ? now - oldest.ms : null,
      lastCompletedAtMs: lastDone?.ms ?? null,
    };
  }

  return {
    personaId,
    personaLabel,
    personaScope,
    convoTail,
    contextTokenEstimate,
    contextWatermark,
    contextLineTotal,
    queueSummary,
  };
}

// ── Transcript Heartbeat panel ────────────────────────────
// Source: ledger_entries WHERE source='voice' (inbound STT + outbound Meepo spoken)
// Session-scoped when activeSessionId is available

const TRANSCRIPT_STALE_MS = 120_000; // 2 minutes

/** Derive role from ledger tags: "npc,meepo,spoken" → "meepo", "human" → "human" */
function parseLedgerRole(tags: string | null): "human" | "meepo" {
  if (tags && tags.includes("meepo")) return "meepo";
  return "human";
}

function readTranscriptHeartbeatPanel(
  db: any,
  guildId: string,
  sessionId: string | null,
  sinceMs: number,
): TranscriptHeartbeatPanel {
  if (!tableExists(db, "ledger_entries")) {
    return { lastSpokenLineAt: null, lastCaptureAt: null, recentExcerpts: [], spokenLineCount: 0, status: "silent" };
  }

  const clauses: string[] = [];
  const params: any[] = [guildId];
  if (sessionId) { clauses.push("AND session_id = ?"); params.push(sessionId); }
  if (sinceMs > 0) { clauses.push("AND timestamp_ms >= ?"); params.push(sinceMs); }
  const extraWhere = clauses.join(" ");

  // Latest voice entries (inbound STT + outbound Meepo spoken)
  const excerptRows = safeAll<any>(
    db,
    `SELECT author_name, content_norm, content, timestamp_ms, tags
     FROM ledger_entries
     WHERE guild_id = ? ${extraWhere}
       AND source = 'voice'
     ORDER BY timestamp_ms DESC
     LIMIT 10`,
    ...params,
  );

  const recentExcerpts: TranscriptExcerpt[] = excerptRows.reverse().map((r) => ({
    authorName: r.author_name ?? "?",
    content: (r.content_norm || r.content || "").slice(0, 200),
    timestampMs: r.timestamp_ms ?? 0,
    role: parseLedgerRole(r.tags),
  }));

  // Last spoken line: latest row of either kind (for display)
  const lastSpokenLineAt = excerptRows.length > 0
    ? Math.max(...excerptRows.map((r) => r.timestamp_ms ?? 0))
    : null;

  // Capture health: based on latest INBOUND human voice only
  const inboundRows = excerptRows.filter((r) => !r.tags?.includes("meepo"));
  const lastCaptureAt = inboundRows.length > 0
    ? Math.max(...inboundRows.map((r) => r.timestamp_ms ?? 0))
    : null;

  // Spoken line count (same scope + time filter, includes both sides)
  const countRow = safeGet<any>(
    db,
    `SELECT COUNT(*) as cnt FROM ledger_entries
     WHERE guild_id = ? ${extraWhere} AND source = 'voice'`,
    ...params,
  );

  const spokenLineCount = countRow?.cnt ?? 0;

  // Status: tied to INBOUND capture freshness (not Meepo output)
  const now = Date.now();
  let status: TranscriptHeartbeatPanel["status"] = "silent";
  if (lastCaptureAt !== null) {
    status = now - lastCaptureAt > TRANSCRIPT_STALE_MS ? "stale" : "healthy";
  }

  return { lastSpokenLineAt, lastCaptureAt, recentExcerpts, spokenLineCount, status };
}

// ── Compose ───────────────────────────────────────────────

export function readMeepoRuntimeSnapshot(args: {
  guildId: string;
  campaignSlug?: string | null;
  sinceMs?: number;
  range?: TimeRange | null;
}): MeepoRuntimeSnapshot {
  const guildId = args.guildId.trim();
  const slugFromParam = args.campaignSlug?.trim() || null;
  const campaignSlug = slugFromParam || getGuildCampaignSlug(guildId);
  const sinceMs = args.sinceMs ?? 0;
  const range = args.range ?? null;
  const slugSource: DebugScope["slugSource"] = slugFromParam
    ? "route-param"
    : campaignSlug
      ? "control-db-lookup"
      : "none";

  const baseDebugScope = {
    slugSource,
    usedCompatibilityPath: false,
    selectedRange: range,
    computedSinceMs: sinceMs > 0 ? sinceMs : null,
    timeFilterAppliesTo: ["recentEvents", "transcriptHeartbeat"],
  } as const;

  if (!campaignSlug) {
    return emptySnapshot(guildId, "unknown", {
      resolvedGuildId: guildId,
      resolvedCampaignSlug: null,
      resolvedSessionId: null,
      liveRuntimeCampaignSlug: null,
      ...baseDebugScope,
    });
  }

  let db: any;
  try {
    db = getDbForCampaignScope({ campaignSlug, guildId });
  } catch {
    return emptySnapshot(guildId, campaignSlug, {
      resolvedGuildId: guildId,
      resolvedCampaignSlug: campaignSlug,
      resolvedSessionId: null,
      liveRuntimeCampaignSlug: null,
      ...baseDebugScope,
    });
  }

  const runtime = readRuntimePanel(db, guildId);
  const sessionId = runtime.activeSessionId;

  // Determine live runtime campaign slug from control DB for mismatch detection
  const liveRuntimeCampaignSlug = getGuildCampaignSlug(guildId);

  const debugScope: DebugScope = {
    resolvedGuildId: guildId,
    resolvedCampaignSlug: campaignSlug,
    resolvedSessionId: sessionId,
    liveRuntimeCampaignSlug,
    ...baseDebugScope,
  };

  return {
    guildId,
    campaignSlug,
    fetchedAt: Date.now(),
    runtime,
    recentEvents: readRecentEventsPanel(db, guildId, sinceMs),
    context: readContextPanel(db, guildId, sessionId),
    transcriptHeartbeat: readTranscriptHeartbeatPanel(db, guildId, sessionId, sinceMs),
    debugScope,
  };
}

function emptySnapshot(guildId: string, campaignSlug: string, debugScope: DebugScope): MeepoRuntimeSnapshot {
  return {
    guildId,
    campaignSlug,
    fetchedAt: Date.now(),
    runtime: emptyRuntimePanel(),
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
    debugScope,
  };
}
