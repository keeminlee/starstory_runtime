/**
 * Bot runtime heartbeat writer.
 *
 * Writes a summary row to bot_runtime_heartbeat on state changes so the web
 * dashboard can read current bot state without needing in-memory access.
 *
 * All data is derived from existing singletons/DB reads — this module only
 * composes and persists the snapshot.
 */

import { getDbForCampaign } from "../db.js";
import { resolveCampaignSlug } from "../campaign/guildConfig.js";
import { deriveLifecycleState } from "../sessions/lifecycleState.js";
import { getActiveSession } from "../sessions/sessions.js";
import { resolveEffectiveMode } from "../sessions/sessionRuntime.js";
import { getVoiceState } from "../voice/state.js";
import { getActiveMeepo } from "../meepo/state.js";
import { getEffectivePersonaId } from "../meepo/personaState.js";
import { getPersona } from "../personas/index.js";
import { getMeepoContextWorkerStatus } from "../ledger/meepoContextWorker.js";
import { log } from "../utils/logger.js";

const heartbeatLog = log.withScope("heartbeat");

// ── Debounce ──────────────────────────────────────────────

const DEBOUNCE_MS = 2_000;
const KEEPALIVE_MS = 60_000;

const pendingGuilds = new Map<string, NodeJS.Timeout>();
let keepaliveTimer: NodeJS.Timeout | null = null;
const trackedGuilds = new Set<string>();

// ── Core writer ───────────────────────────────────────────

function writeHeartbeat(guildId: string): void {
  try {
    const campaignSlug = resolveCampaignSlug({ guildId });
    const db = getDbForCampaign(campaignSlug);

    const lifecycle = deriveLifecycleState(guildId);
    const voice = getVoiceState(guildId);
    const session = getActiveSession(guildId);
    const meepo = getActiveMeepo(guildId);
    const effectiveMode = resolveEffectiveMode(guildId);
    const personaId = getEffectivePersonaId(guildId);

    let personaLabel: string | null = null;
    try {
      personaLabel = getPersona(personaId).displayName;
    } catch {
      personaLabel = personaId;
    }

    const workerStatus = getMeepoContextWorkerStatus(guildId);
    const now = Date.now();

    db.prepare(`
      INSERT INTO bot_runtime_heartbeat (
        guild_id, lifecycle_state, voice_channel_id, voice_connected,
        stt_enabled, hush_enabled, active_session_id, active_session_label,
        active_persona_id, persona_label, form_id, effective_mode,
        context_worker_running, context_queue_queued, context_queue_failed,
        updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        lifecycle_state = excluded.lifecycle_state,
        voice_channel_id = excluded.voice_channel_id,
        voice_connected = excluded.voice_connected,
        stt_enabled = excluded.stt_enabled,
        hush_enabled = excluded.hush_enabled,
        active_session_id = excluded.active_session_id,
        active_session_label = excluded.active_session_label,
        active_persona_id = excluded.active_persona_id,
        persona_label = excluded.persona_label,
        form_id = excluded.form_id,
        effective_mode = excluded.effective_mode,
        context_worker_running = excluded.context_worker_running,
        context_queue_queued = excluded.context_queue_queued,
        context_queue_failed = excluded.context_queue_failed,
        updated_at_ms = excluded.updated_at_ms
    `).run(
      guildId,
      lifecycle,
      voice?.channelId ?? null,
      voice ? 1 : 0,
      voice?.sttEnabled ? 1 : 0,
      voice?.hushEnabled ? 1 : 0,
      session?.session_id ?? null,
      session?.label ?? null,
      personaId,
      personaLabel,
      meepo?.form_id ?? null,
      effectiveMode,
      workerStatus.running ? 1 : 0,
      workerStatus.queue.queuedCount,
      workerStatus.queue.failedCount,
      now,
    );
  } catch (err) {
    heartbeatLog.warn(`Heartbeat write failed for guild ${guildId}: ${err}`);
  }
}

// ── Public API ────────────────────────────────────────────

/**
 * Schedule a heartbeat write for a guild. Debounced to avoid rapid-fire
 * writes during bursts of state changes.
 */
export function emitHeartbeat(guildId: string): void {
  trackedGuilds.add(guildId);

  const existing = pendingGuilds.get(guildId);
  if (existing) return; // already scheduled

  const timer = setTimeout(() => {
    pendingGuilds.delete(guildId);
    writeHeartbeat(guildId);
  }, DEBOUNCE_MS);

  pendingGuilds.set(guildId, timer);
}

/**
 * Start the keepalive timer. Writes heartbeat for all tracked guilds
 * every KEEPALIVE_MS so staleness detection works even when idle.
 */
export function startHeartbeatKeepalive(): void {
  if (keepaliveTimer) return;
  keepaliveTimer = setInterval(() => {
    for (const guildId of trackedGuilds) {
      writeHeartbeat(guildId);
    }
  }, KEEPALIVE_MS);
  heartbeatLog.info("Heartbeat keepalive started");
}

/**
 * Stop the keepalive timer and cancel pending writes.
 */
export function stopHeartbeat(): void {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
  for (const timer of pendingGuilds.values()) {
    clearTimeout(timer);
  }
  pendingGuilds.clear();
  heartbeatLog.info("Heartbeat stopped");
}
