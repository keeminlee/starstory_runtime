# Runtime Inspector — Manual Verification Matrix

> Run each scenario and record observed vs expected values.
> This matrix validates the Runtime Inspector's source-of-truth correctness.

---

## Scenario 1: Bot Idle (no session, no voice)

| Tile | Field | Expected | Observed | Pass |
|---|---|---|---|---|
| Runtime | Lifecycle | Dormant | | |
| Runtime | Stale badge | Stale (if no recent keepalive; not stale if bot is running idle) | | |
| Runtime | Voice | disconnected | | |
| Runtime | Session | none | | |
| Runtime | Persona | default or — | | |
| Runtime | Context Worker | stopped | | |
| Recent Events | List | Empty or only old interactions | | |
| Context | Persona | Default or — | | |
| Context | Convo tail | "No conversation log" (no session → no session_id → skipped) | | |
| Context | Queue | Hidden (no pending) | | |
| Transcript | Status badge | Silent (no voice entries) or Stale (old entries) | | |
| Transcript | Count | 0 entries (no session-scoped voice) | | |
| Debug Scope | session_id | null | | |

---

## Scenario 2: Session Started, No Voice Traffic

| Tile | Field | Expected | Observed | Pass |
|---|---|---|---|---|
| Runtime | Lifecycle | Awakened or Showtime | | |
| Runtime | Stale badge | Not stale (heartbeat from startSession) | | |
| Runtime | Voice | disconnected | | |
| Runtime | Session | Shows session label/id | | |
| Recent Events | List | May have interaction rows from text triggers | | |
| Context | Convo tail | May have text convo entries for this session | | |
| Transcript | Status badge | Silent (no source='voice' entries yet) | | |
| Transcript | Count | 0 entries | | |
| Debug Scope | session_id | Matches runtime.activeSessionId | | |

---

## Scenario 3: Voice Connected, User Speaks, STT Accepted, No Reply

| Tile | Field | Expected | Observed | Pass |
|---|---|---|---|---|
| Runtime | Voice | connected (channelId shown) | | |
| Runtime | STT | enabled | | |
| Recent Events | List | May show interaction with trigger_miss or gating reason | | |
| Transcript | Status badge | Healthy (< 2min since voice entry) | | |
| Transcript | Count | >0 entries | | |
| Transcript | Excerpts | Shows user speech | | |

---

## Scenario 4: User Speaks, Meepo Replies (Full Interaction)

| Tile | Field | Expected | Observed | Pass |
|---|---|---|---|---|
| Runtime | Lifecycle | Showtime | | |
| Runtime | Stale badge | Not stale | | |
| Runtime | Voice | connected | | |
| Runtime | Session | Active session shown | | |
| Runtime | Persona | Current persona label | | |
| Runtime | Context Worker | running | | |
| Recent Events | List | ≥1 recent interaction with tier + trigger | | |
| Recent Events | Speaker | Speaker ID shown | | |
| Recent Events | Reply excerpt | voice_reply_content_snippet from meta_json | | |
| Context | Persona | Active persona label | | |
| Context | Convo tail | Recent convo entries from meepo_convo_log | | |
| Context | Token estimate | Non-null if context was assembled | | |
| Context | Watermark | Non-null if context cursor advanced | | |
| Transcript | Status | Healthy | | |
| Transcript | Count | >0 entries | | |
| Transcript | Excerpts | Recent voice entries with speaker attribution | | |
| Debug Scope | All scopes | guild_id, campaign_slug, session_id all populated | | |

---

## Scenario 5: Bot Stopped / Process Killed

| Tile | Field | Expected | Observed | Pass |
|---|---|---|---|---|
| Runtime | Lifecycle | Shows last-written state (may be Showtime/Awakened) | | |
| Runtime | Stale badge | Stale (flips after heartbeat >30s old) | | |
| Runtime | Voice | May still show connected (stale data — expected) | | |
| Runtime | Session | May still show active (stale data is explicitly marked) | | |
| All tiles | Same guild/session | All tiles resolve same scope (debugScope confirms) | | |

---

## Cross-Scenario Invariants

| Invariant | Check |
|---|---|
| All four tiles resolve same guild_id | debugScope.resolvedGuildId matches across all data |
| Session-scoped tiles use same session_id | Context convo tail + Transcript entries are from runtime.activeSessionId |
| No slug-only fallback used | debugScope.slugSource is "route-param" or "control-db-lookup", never "none" with data |
| Transcript title matches content | "Transcript Heartbeat" shows only source='voice' entries |
| Stale badge flips on real heartbeat age | Not based on page load time or polling interval |
| Verbose mode off hides rail button | No /dev/meepo access from UI; backend still functional |
