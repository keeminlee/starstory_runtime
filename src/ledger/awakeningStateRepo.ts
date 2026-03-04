export type ProgressPatch = Record<string, unknown>;

// Repo functions require an explicit db handle to avoid import-time side effects.

export type GuildOnboardingState = {
  guild_id: string;
  script_id: string;
  script_version: number;
  current_scene: string;
  beat_index: number;
  progress_json: Record<string, unknown>;
  completed: boolean;
  created_at: number;
  updated_at: number;
};

type GuildOnboardingRow = {
  guild_id: string;
  script_id: string;
  script_version: number;
  current_scene: string;
  beat_index: number;
  progress_json: string;
  completed: number;
  created_at: number;
  updated_at: number;
};

type RepoOptions = {
  db?: any;
  nowMs?: () => number;
};

function resolveDb(options?: RepoOptions): any {
  if (options?.db) {
    return options.db;
  }
  throw new Error("awakeningStateRepo requires options.db for now");
}

function resolveNow(options?: RepoOptions): number {
  return options?.nowMs?.() ?? Date.now();
}

function parseProgressJson(raw: string | null | undefined, stateKey: string): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    console.warn(`[awakening-state] progress_json was not an object for ${stateKey}; treating as empty object`);
    return {};
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[awakening-state] progress_json parse failed for ${stateKey}; treating as empty object (${message})`);
    return {};
  }
}

function toState(row: GuildOnboardingRow): GuildOnboardingState {
  const stateKey = `${row.guild_id}:${row.script_id}`;
  return {
    guild_id: row.guild_id,
    script_id: row.script_id,
    script_version: row.script_version,
    current_scene: row.current_scene,
    beat_index: row.beat_index,
    progress_json: parseProgressJson(row.progress_json, stateKey),
    completed: row.completed === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function loadState(guildId: string, scriptId = "meepo_awaken", options?: RepoOptions): GuildOnboardingState | null {
  const db = resolveDb(options);
  const row = db
    .prepare(
      `SELECT guild_id, script_id, script_version, current_scene, beat_index, progress_json, completed, created_at, updated_at
       FROM guild_onboarding_state
       WHERE guild_id = ? AND script_id = ?
       LIMIT 1`
    )
    .get(guildId, scriptId) as GuildOnboardingRow | undefined;

  if (!row) return null;
  return toState(row);
}

export function initState(
  guildId: string,
  scriptId: string,
  scriptVersion: number,
  startScene: string,
  options?: RepoOptions,
): GuildOnboardingState {
  const db = resolveDb(options);
  const now = resolveNow(options);

  db.prepare(
    `INSERT OR IGNORE INTO guild_onboarding_state (
      guild_id, script_id, script_version, current_scene, beat_index, progress_json, completed, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, '{}', 0, ?, ?)`
  ).run(guildId, scriptId, scriptVersion, startScene, now, now);

  const state = loadState(guildId, scriptId, { db });
  if (!state) {
    throw new Error(`Failed to initialize onboarding state for guild=${guildId} script=${scriptId}`);
  }
  return state;
}

export function saveProgress(
  guildId: string,
  scriptId: string,
  patch: ProgressPatch,
  options?: RepoOptions,
): GuildOnboardingState {
  const db = resolveDb(options);
  const existing = loadState(guildId, scriptId, { db });
  if (!existing) {
    throw new Error(`Cannot save progress; state not found for guild=${guildId} script=${scriptId}`);
  }

  const merged = {
    ...existing.progress_json,
    ...patch,
  };

  const now = resolveNow(options);
  db.prepare(
    `UPDATE guild_onboarding_state
     SET progress_json = ?, updated_at = ?
     WHERE guild_id = ? AND script_id = ?`
  ).run(JSON.stringify(merged), now, guildId, scriptId);

  return loadState(guildId, scriptId, { db })!;
}

export function advanceScene(
  guildId: string,
  scriptId: string,
  sceneId: string,
  options?: RepoOptions,
): GuildOnboardingState {
  const db = resolveDb(options);
  const now = resolveNow(options);

  const result = db.prepare(
    `UPDATE guild_onboarding_state
     SET current_scene = ?, beat_index = 0, updated_at = ?
     WHERE guild_id = ? AND script_id = ?`
  ).run(sceneId, now, guildId, scriptId);

  if (result.changes === 0) {
    throw new Error(`Cannot advance scene; state not found for guild=${guildId} script=${scriptId}`);
  }

  return loadState(guildId, scriptId, { db })!;
}

export function setBeatIndex(
  guildId: string,
  scriptId: string,
  beatIndex: number,
  options?: RepoOptions,
): GuildOnboardingState {
  if (!Number.isInteger(beatIndex) || beatIndex < 0) {
    throw new Error(`beatIndex must be an integer >= 0; received ${beatIndex}`);
  }

  const db = resolveDb(options);
  const now = resolveNow(options);

  const result = db.prepare(
    `UPDATE guild_onboarding_state
     SET beat_index = ?, updated_at = ?
     WHERE guild_id = ? AND script_id = ?`
  ).run(beatIndex, now, guildId, scriptId);

  if (result.changes === 0) {
    throw new Error(`Cannot set beat index; state not found for guild=${guildId} script=${scriptId}`);
  }

  return loadState(guildId, scriptId, { db })!;
}

export function markComplete(guildId: string, scriptId: string, options?: RepoOptions): GuildOnboardingState {
  const db = resolveDb(options);
  const now = resolveNow(options);
  const result = db.prepare(
    `UPDATE guild_onboarding_state
     SET completed = 1, updated_at = ?
     WHERE guild_id = ? AND script_id = ?`
  ).run(now, guildId, scriptId);

  if (result.changes === 0) {
    throw new Error(`Cannot mark complete; state not found for guild=${guildId} script=${scriptId}`);
  }

  return loadState(guildId, scriptId, { db })!;
}
