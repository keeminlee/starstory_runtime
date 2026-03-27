# Runtime Inspector — Field-Routing Source Map

> **Purpose**: Canonical contract for every visible field in the Meepo Runtime Inspector.
> Each row declares exactly one source, scope, and freshness expectation.
> No field is "kind of assembled from wherever."

---

## Scope Identity

| Key | Resolved from | Notes |
|---|---|---|
| `guildId` | Rail button href → route `?guild_id=` → API route param → reader arg | Must be the same across all tiles |
| `campaignSlug` | Client passes `campaign_slug` from `useActiveCampaignScope()` → API falls back to `getGuildCampaignSlug(guildId)` via control DB | Canonical: `guild_config.campaign_slug` in `data/control/control.sqlite` |
| `sessionId` | Derived from `bot_runtime_heartbeat.active_session_id` (the heartbeat's view of the active session) | Passed to Context and Transcript tiles; not independently resolved |

---

## A. Runtime Panel

| UI Field | API Property | Canonical Source | Table/Column | Scope Key | Freshness | Fallback | Empty State |
|---|---|---|---|---|---|---|---|
| Lifecycle badge | `runtime.lifecycleState` | `bot_runtime_heartbeat` | `lifecycle_state` | `guild_id` | Live (heartbeat, ≤30s stale) | `"Dormant"` | Dormant badge |
| Stale badge | `runtime.heartbeatStale` | Computed: `now - heartbeat.updated_at_ms > 30s` | `updated_at_ms` | `guild_id` | Computed client-side-ish (server `Date.now()`) | `true` if no row | Stale badge shown |
| Mode | `runtime.effectiveMode` | `bot_runtime_heartbeat` | `effective_mode` | `guild_id` | Live (heartbeat) | `null` → "—" | "—" |
| Voice status | `runtime.voiceConnected` / `.voiceChannelId` | `bot_runtime_heartbeat` | `voice_connected`, `voice_channel_id` | `guild_id` | Live (heartbeat) | `false` / `null` | "disconnected" |
| STT | `runtime.sttEnabled` | `bot_runtime_heartbeat` | `stt_enabled` | `guild_id` | Live (heartbeat) | `false` | "disabled" |
| Hush | `runtime.hushEnabled` | `bot_runtime_heartbeat` | `hush_enabled` | `guild_id` | Live (heartbeat) | `false` | Row hidden |
| Session | `runtime.activeSessionId` / `.activeSessionLabel` | `bot_runtime_heartbeat` | `active_session_id`, `active_session_label` | `guild_id` | Live (heartbeat) | `null` | "none" |
| Persona | `runtime.activePersonaId` / `.personaLabel` | `bot_runtime_heartbeat` | `active_persona_id`, `persona_label` | `guild_id` | Live (heartbeat) | `null` | "—" |
| Form | `runtime.formId` | `bot_runtime_heartbeat` | `form_id` | `guild_id` | Live (heartbeat) | `null` | Row hidden |
| Context Worker | `runtime.contextWorkerRunning` | `bot_runtime_heartbeat` | `context_worker_running` | `guild_id` | Live (heartbeat) | `false` | "stopped" |
| Queue stats | `runtime.contextQueueQueued` / `.contextQueueFailed` | `bot_runtime_heartbeat` | `context_queue_queued`, `context_queue_failed` | `guild_id` | Live (heartbeat) | `0` | Row hidden |
| Heartbeat age | `runtime.heartbeatUpdatedAt` | `bot_runtime_heartbeat` | `updated_at_ms` | `guild_id` | Live | `null` | Row hidden |

**Source contract**: Runtime panel reads **exclusively** from `bot_runtime_heartbeat`. No secondary source.

**Heartbeat writer callsites** (src/runtime/heartbeatWriter.ts):
- `wakeMeepo()` / `sleepMeepo()` — src/meepo/state.ts
- `startSession()` / `endSession()` — src/sessions/sessions.ts
- `joinVoice()` / `leaveVoice()` — src/voice/connection.ts
- `setActivePersonaId()` — src/meepo/personaState.ts
- Keepalive: 60s interval for all tracked guilds — src/bot.ts ready handler

---

## B. Recent Events Panel

| UI Field | API Property | Canonical Source | Table/Column | Scope Key | Freshness | Fallback | Empty State |
|---|---|---|---|---|---|---|---|
| Event tier badge | `recentEvents.interactions[].tier` | `meepo_interactions` | `tier` | `guild_id` | Durable (DB rows) | — | — |
| Trigger kind | `recentEvents.interactions[].triggerKind` | `meepo_interactions` | `trigger` | `guild_id` | Durable | — | — |
| Speaker name | `recentEvents.interactions[].speakerName` | `meepo_interactions` | `speaker_id` + resolved (see note) | `guild_id` | Durable | `null` | Hidden |
| Reply excerpt | `recentEvents.interactions[].replyExcerpt` | `meepo_interactions` | `meta_json → voice_reply_content_snippet` | `guild_id` | Durable | `null` | Hidden |
| Timestamp | `recentEvents.interactions[].timestampMs` | `meepo_interactions` | `created_at_ms` | `guild_id` | Durable | — | — |

**Design decision**: This tile is **interaction-centric** — showing `meepo_interactions` rows. Not operator-centric pipeline events.

**Schema corrections needed** (v0 → v1):
- Column `trigger_kind` → actual column is `trigger`
- Column `speaker_name` → actual column is `speaker_id` (display as-is; no server-side name resolution for v0)
- Column `reply_content` → does not exist; extract from `meta_json` → `voice_reply_content_snippet`
- No `guild_id` filter bug — correct as-is

---

## C. Context Snapshot Panel

| UI Field | API Property | Canonical Source | Table/Column | Scope Key | Freshness | Fallback | Empty State |
|---|---|---|---|---|---|---|---|
| Persona label | `context.personaLabel` | `bot_runtime_heartbeat` (preferred) / `guild_runtime_state` (fallback) | `persona_label` / `active_persona_id` | `guild_id` | Live (heartbeat) / Durable (runtime_state) | `null` → "—" | "—" |
| Persona ID | `context.personaId` | `guild_runtime_state` → `bot_runtime_heartbeat` | `active_persona_id` | `guild_id` | Durable / Live | `null` | — |
| Token estimate | `context.contextTokenEstimate` | `meepo_context` | `token_estimate` | `guild_id` | Durable | `null` | Hidden |
| Watermark | `context.contextWatermark` | `meepo_context` | `canon_line_cursor_watermark` | `guild_id` | Durable | `null` | Hidden |
| Message count | `context.contextMessageCount` | ~~`meepo_context.message_count`~~ **DOES NOT EXIST** | — | — | — | `null` | Hidden |
| Convo tail | `context.convoTail[]` | `meepo_convo_log` | `role`, `speaker_name`, `content_raw`/`content_norm`, `ts_ms` | `session_id` | Durable (session-scoped) | `[]` | "No conversation log" |
| Queue summary | `context.queueSummary` | `meepo_actions` | `status` (pending/processing/done/failed), `created_at_ms`, `completed_at_ms` | global (all statuses) | Durable | `null` | Hidden |

**Schema corrections needed** (v0 → v1):
- `meepo_convo_log`: `author_name` → `speaker_name`, `content` → `COALESCE(content_norm, content_raw)`
- `meepo_context`: `watermark` → `canon_line_cursor_watermark`, remove `message_count` (column doesn't exist)
- `meepo_actions`: status `'queued'` → `'pending'`, `'leased'` → `'processing'`

---

## D. Spoken Transcript Panel

| UI Field | API Property | Canonical Source | Table/Column | Scope Key | Freshness | Fallback | Empty State |
|---|---|---|---|---|---|---|---|
| Status badge | `transcriptHeartbeat.status` | Computed from `lastCaptureAt` (inbound only) vs `now` (>2min = stale) | `ledger_entries.timestamp_ms WHERE tags NOT LIKE '%meepo%'` | `guild_id` + `session_id` (when available) | Computed | `"silent"` | Silent badge |
| Last spoken line | `transcriptHeartbeat.lastSpokenLineAt` | `ledger_entries` | `MAX(timestamp_ms) WHERE source='voice'` (any role) | `guild_id` + optional `session_id` | Durable | `null` | "never" |
| Last capture | `transcriptHeartbeat.lastCaptureAt` | `ledger_entries` | `MAX(timestamp_ms) WHERE source='voice' AND tags NOT LIKE '%meepo%'` | `guild_id` + optional `session_id` | Durable | `null` | — |
| Line count | `transcriptHeartbeat.spokenLineCount` | `ledger_entries` | `COUNT(*) WHERE source='voice'` (both inbound + outbound) | `guild_id` + optional `session_id` | Durable | `0` | "0 lines" |
| Excerpt rows | `transcriptHeartbeat.recentExcerpts[]` | `ledger_entries` | `author_name`, `content_norm`/`content`, `timestamp_ms`, `tags` | `guild_id` + optional `session_id` | Durable | `[]` | "No spoken lines" |
| Excerpt role | `transcriptHeartbeat.recentExcerpts[].role` | Derived from `tags` | `tags LIKE '%meepo%'` → `"meepo"`, else `"human"` | — | — | `"human"` | — |

**Design decision**: This tile is a **Spoken Transcript** — `source = 'voice'` filter enforced. Includes both inbound STT (human voice capture) and outbound Meepo spoken voice replies.

**Health badge**: Tied to **inbound capture freshness only**. This prevents the badge from looking "healthy" just because Meepo spoke recently — capture health reflects whether the STT pipeline is actively receiving human input.

**Row distinction**: Meepo spoken rows have `tags = 'npc,meepo,spoken'` and `role = "meepo"`. Human inbound rows have `tags = 'human'` and `role = "human"`. Both have `source = 'voice'`.

### Canonical Outbound Spoken Voice Write Callsite

Meepo spoken voice replies are logged **at the TTS playback commit point** — after `speakInGuild()` is called and before the reply is confirmed. This represents "this text was actually committed to spoken output."

**File**: `src/voice/voiceReply.ts` (after `speakInGuild()` call, ~line 595)

```typescript
appendLedgerEntry({
  guild_id: guildId,
  channel_id: channelId,
  message_id: `voice-reply-${randomUUID()}`,
  author_id: botUserId,
  author_name: persona?.displayName ?? "Meepo",
  timestamp_ms: Date.now(),
  content: responseText,
  tags: "npc,meepo,spoken",
  source: "voice",
  narrative_weight: "primary",
  speaker_id: botUserId,
  session_id: activeSession?.session_id ?? null,
});
```

**Rule**: Only spoken voice replies are logged here. Text-only replies (`reply_mode="text"`) go through a separate text-channel path. LLM output that never reaches TTS does not appear as a spoken transcript row.

**No schema corrections needed**: `ledger_entries` columns match reader queries exactly.

---

## Scope Propagation Path

```
Rail button href: /dev/meepo?guild_id=${activeGuildId}
    → page.tsx: force-dynamic, wraps <MeepoDashboard />
    → meepo-dashboard.tsx: useActiveCampaignScope() → { slug, guildId }
    → fetch: /api/dev/meepo-snapshot?guild_id=${guildId}&campaign_slug=${slug}
    → route.ts: resolveWebAuthContext → assertDevSurfaceAccess → parse guild_id + campaign_slug
    → meepoSnapshotReader.ts: getDbForCampaignScope({ campaignSlug, guildId })
        fallback: getGuildCampaignSlug(guildId) from control DB
    → all tile readers use same `db` + `guildId` + derived `sessionId`
```

**Session ID derivation**: `runtime.activeSessionId` from heartbeat row is used as scope key for Context and Transcript tiles. This means if heartbeat is stale/absent, session-scoped tiles get `null` session → they fall back to guild-wide queries instead of session-scoped ones.

---

## Known Issues Fixed in This Audit

| # | Issue | Affected Tile | Root Cause | Fix |
|---|---|---|---|---|
| 1 | `trigger_kind` column doesn't exist | Recent Events | Column is named `trigger` | Fix SELECT to use `trigger` |
| 2 | `speaker_name` column doesn't exist | Recent Events | Column is `speaker_id` (no name stored) | Use `speaker_id` as display, rename DTO |
| 3 | `reply_content` column doesn't exist | Recent Events | Reply info is in `meta_json` | Parse `meta_json` → extract snippet |
| 4 | `author_name` column doesn't exist in `meepo_convo_log` | Context | Column is `speaker_name` | Fix SELECT |
| 5 | `content` column doesn't exist in `meepo_convo_log` | Context | Columns are `content_raw` / `content_norm` | Use `COALESCE(content_norm, content_raw)` |
| 6 | `watermark` column doesn't exist in `meepo_context` | Context | Column is `canon_line_cursor_watermark` | Fix SELECT |
| 7 | `message_count` doesn't exist in `meepo_context` | Context | Column was fabricated | Remove from query; use `canon_line_cursor_total` |
| 8 | `meepo_actions` status `'queued'`/`'leased'` never exist | Context queue | Actual values: `'pending'`/`'processing'` | Fix WHERE clauses |

---

## Filter Applicability

Time-window filter (`range` param) and campaign selector added in the Filters sprint.

| Panel | Honors `range` filter? | Honors `campaign_slug`? | Notes |
|---|---|---|---|
| **Runtime** | No — always live | Yes (via campaign-scoped DB) | Shows campaign mismatch warning when selected ≠ live |
| **Recent Events** | **Yes** — `created_at_ms >= sinceMs` | Yes (via campaign-scoped DB) | Empty state reflects active window label |
| **Context Snapshot** | No — always live/current | Yes (via campaign-scoped DB) | Shows "Live · not time-filtered" note when range ≠ all |
| **Transcript Heartbeat** | **Yes** — `timestamp_ms >= sinceMs` | Yes (via campaign-scoped DB) | Subtitle shows window label; empty state reflects it |

### URL-backed State

```
/dev/meepo?range=7d&campaign_slug=my-campaign&guild_id=12345
```

- `range`: `today | 7d | 30d | all` — default `7d`
- `campaign_slug`: overrides `useActiveCampaignScope()` context slug

### DebugScope Filter Provenance

```ts
{
  selectedRange: "7d",
  computedSinceMs: 1699913600000,
  timeFilterAppliesTo: ["recentEvents", "transcriptHeartbeat"],
  liveRuntimeCampaignSlug: "my-campaign",  // from bot_runtime_heartbeat
}
```
