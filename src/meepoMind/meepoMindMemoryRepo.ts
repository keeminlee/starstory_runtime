export type MeepoMindMemoryScopeKind = "guild";

export type MeepoMindMemoryRow = {
  scope_kind: MeepoMindMemoryScopeKind;
  scope_id: string;
  key: string;
  text: string;
  tags_json: string;
  source: string;
  created_at_ms: number;
  updated_at_ms: number;
};

export type MeepoMindMemory = {
  scopeKind: MeepoMindMemoryScopeKind;
  scopeId: string;
  key: string;
  text: string;
  tags: string[];
  source: string;
  createdAtMs: number;
  updatedAtMs: number;
};

function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function toMemory(row: MeepoMindMemoryRow): MeepoMindMemory {
  return {
    scopeKind: row.scope_kind,
    scopeId: row.scope_id,
    key: row.key,
    text: row.text,
    tags: parseTags(row.tags_json),
    source: row.source,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

function normalizeKey(value: string): string {
  const key = value.trim();
  if (!key) {
    throw new Error("Memory key must be a non-empty string");
  }
  return key;
}

function normalizeText(value: string): string {
  const text = value.trim();
  if (!text) {
    throw new Error("Memory text must be a non-empty string");
  }
  return text;
}

function normalizeSource(value: string): string {
  const source = value.trim();
  if (!source) {
    throw new Error("Memory source must be a non-empty string");
  }
  return source;
}

function normalizeTags(tags: string[]): string[] {
  const normalized = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
  return [...new Set(normalized)];
}

export function getMemoryByScopeAndKey(args: {
  db: any;
  scopeKind: MeepoMindMemoryScopeKind;
  scopeId: string;
  key: string;
}): MeepoMindMemory | null {
  const row = args.db
    .prepare(
      `SELECT scope_kind, scope_id, key, text, tags_json, source, created_at_ms, updated_at_ms
       FROM meepo_mind_memory
       WHERE scope_kind = ? AND scope_id = ? AND key = ?
       LIMIT 1`
    )
    .get(args.scopeKind, args.scopeId, normalizeKey(args.key)) as MeepoMindMemoryRow | undefined;

  return row ? toMemory(row) : null;
}

export function upsertMemory(args: {
  db: any;
  scopeKind: MeepoMindMemoryScopeKind;
  scopeId: string;
  key: string;
  text: string;
  tags: string[];
  source: string;
  nowMs?: number;
}): MeepoMindMemory {
  const now = args.nowMs ?? Date.now();
  const key = normalizeKey(args.key);
  const text = normalizeText(args.text);
  const source = normalizeSource(args.source);
  const tags = normalizeTags(args.tags);
  const tagsJson = JSON.stringify(tags);

  args.db.prepare(
    `INSERT INTO meepo_mind_memory (
      scope_kind, scope_id, key, text, tags_json, source, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope_kind, scope_id, key) DO UPDATE SET
      text = excluded.text,
      tags_json = excluded.tags_json,
      source = excluded.source,
      updated_at_ms = excluded.updated_at_ms`
  ).run(args.scopeKind, args.scopeId, key, text, tagsJson, source, now, now);

  const row = getMemoryByScopeAndKey({
    db: args.db,
    scopeKind: args.scopeKind,
    scopeId: args.scopeId,
    key,
  });

  if (!row) {
    throw new Error(`Failed to upsert memory for ${args.scopeKind}:${args.scopeId}:${key}`);
  }

  return row;
}

export function getGuildMemoryByKey(args: {
  db: any;
  guildId: string;
  key: string;
}): MeepoMindMemory | null {
  return getMemoryByScopeAndKey({
    db: args.db,
    scopeKind: "guild",
    scopeId: args.guildId,
    key: args.key,
  });
}
