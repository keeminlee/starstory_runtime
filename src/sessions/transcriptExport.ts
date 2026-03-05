import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildTranscript } from "../ledger/transcripts.js";
import { buildSessionArtifactStem, resolveCampaignTranscriptExportsDir } from "../dataPaths.js";
import { getSessionArtifact, upsertSessionArtifact } from "./sessions.js";
import { writeFileAtomic } from "../io/atomicWrite.js";

type BronzeStats = {
  rowCount: number;
  lastTsMs: number;
  lastLineIndex: number;
};

type TranscriptExportMeta = {
  source_row_count?: number;
  source_last_ts_ms?: number;
  source_last_line_index?: number;
  export_sha256?: string;
};

export type EnsureBronzeTranscriptExportCachedResult = {
  path: string;
  bytes: number;
  hash: string;
  cacheHit: boolean;
};

function parseMetaJson(raw: string | null | undefined): TranscriptExportMeta {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as TranscriptExportMeta;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function readBronzeStats(db: any, sessionId: string): BronzeStats | null {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS row_count,
         MAX(timestamp_ms) AS last_ts_ms,
         MAX(line_index) AS last_line_index
       FROM bronze_transcript
       WHERE session_id = ?`
    )
    .get(sessionId) as
      | {
          row_count: number;
          last_ts_ms: number | null;
          last_line_index: number | null;
        }
      | undefined;

  const rowCount = Number(row?.row_count ?? 0);
  if (rowCount <= 0) {
    return null;
  }

  return {
    rowCount,
    lastTsMs: Number(row?.last_ts_ms ?? 0),
    lastLineIndex: Number(row?.last_line_index ?? rowCount - 1),
  };
}

type RawEntry = {
  id: string;
  author_name: string;
  content: string;
  content_norm: string | null;
  timestamp_ms: number;
  t_end_ms: number | null;
  source: "text" | "voice" | "offline_ingest" | string;
};

type BronzeLine = {
  line_index: number;
  author_name: string;
  content: string;
  timestamp_ms: number;
  source_type: string;
  source_ids: string[];
};

const VOICE_FUSE_GAP_MS = 6000;

function loadRawEntriesForBronzeCompile(db: any, sessionId: string): RawEntry[] {
  return db
    .prepare(
      `SELECT id, author_name, content, content_norm, timestamp_ms, t_end_ms, source
       FROM ledger_entries
       WHERE session_id = ?
         AND source IN ('text', 'voice', 'offline_ingest')
         AND narrative_weight = 'primary'
       ORDER BY timestamp_ms ASC, id ASC`
    )
    .all(sessionId) as RawEntry[];
}

function fuseVoiceEntries(entries: RawEntry[]): BronzeLine[] {
  const result: BronzeLine[] = [];
  let index = 0;

  while (index < entries.length) {
    const current = entries[index]!;
    const normalized = current.content_norm ?? current.content;

    if (current.source === "voice") {
      const group: RawEntry[] = [current];
      let nextIndex = index + 1;
      while (nextIndex < entries.length) {
        const next = entries[nextIndex]!;
        if (next.source !== "voice") break;
        if (next.author_name !== current.author_name) break;

        const previous = group[group.length - 1]!;
        const previousEnd = previous.t_end_ms ?? previous.timestamp_ms;
        if (next.timestamp_ms - previousEnd > VOICE_FUSE_GAP_MS) break;

        group.push(next);
        nextIndex += 1;
      }

      result.push({
        line_index: result.length,
        author_name: current.author_name,
        content: group.map((entry) => entry.content_norm ?? entry.content).join(" "),
        timestamp_ms: current.timestamp_ms,
        source_type: group.length > 1 ? "voice_fused" : "voice",
        source_ids: group.map((entry) => entry.id),
      });

      index = nextIndex;
      continue;
    }

    result.push({
      line_index: result.length,
      author_name: current.author_name,
      content: normalized,
      timestamp_ms: current.timestamp_ms,
      source_type: current.source,
      source_ids: [current.id],
    });
    index += 1;
  }

  return result;
}

function mapIngestEntries(entries: RawEntry[]): BronzeLine[] {
  return entries.map((entry, idx) => ({
    line_index: idx,
    author_name: entry.author_name,
    content: entry.content_norm ?? entry.content,
    timestamp_ms: entry.timestamp_ms,
    source_type: entry.source,
    source_ids: [entry.id],
  }));
}

function compileBronzeTranscriptIfMissing(db: any, sessionId: string): void {
  if (readBronzeStats(db, sessionId)) {
    return;
  }

  const session = db
    .prepare("SELECT source FROM sessions WHERE session_id = ? LIMIT 1")
    .get(sessionId) as { source: string | null } | undefined;
  if (!session) {
    return;
  }

  const rawEntries = loadRawEntriesForBronzeCompile(db, sessionId);
  if (rawEntries.length === 0) {
    return;
  }

  const lines = session.source === "live"
    ? fuseVoiceEntries(rawEntries)
    : mapIngestEntries(rawEntries);

  const now = Date.now();
  const deleteOld = db.prepare("DELETE FROM bronze_transcript WHERE session_id = ?");
  const insert = db.prepare(
    `INSERT OR REPLACE INTO bronze_transcript
      (session_id, line_index, author_name, content, timestamp_ms, source_type, source_ids, compiled_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    deleteOld.run(sessionId);
    for (const line of lines) {
      insert.run(
        sessionId,
        line.line_index,
        line.author_name,
        line.content,
        line.timestamp_ms,
        line.source_type,
        JSON.stringify(line.source_ids),
        now
      );
    }
  });

  tx();
}

function hasFreshExport(args: {
  artifact: any;
  bronze: BronzeStats;
}): { path: string; bytes: number; hash: string } | null {
  const filePath = args.artifact?.file_path;
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    return null;
  }

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const meta = parseMetaJson(args.artifact?.meta_json);
  if (
    Number(meta.source_row_count ?? -1) !== args.bronze.rowCount ||
    Number(meta.source_last_ts_ms ?? -1) !== args.bronze.lastTsMs ||
    Number(meta.source_last_line_index ?? -1) !== args.bronze.lastLineIndex
  ) {
    return null;
  }

  const bytes = Number(args.artifact?.size_bytes ?? fs.statSync(filePath).size);
  const hash = typeof args.artifact?.source_hash === "string" && args.artifact.source_hash.length > 0
    ? args.artifact.source_hash
    : String(meta.export_sha256 ?? "");

  return {
    path: filePath,
    bytes,
    hash,
  };
}

function renderBronzeTranscriptLog(sessionId: string, entries: ReturnType<typeof buildTranscript>): string {
  const lines: string[] = [];
  lines.push(`# Bronze transcript export`);
  lines.push(`# session_id=${sessionId}`);
  lines.push(`# lines=${entries.length}`);
  lines.push(`# compiled=${new Date().toISOString()}`);
  lines.push("");
  for (const entry of entries) {
    lines.push(`${entry.author_name}: ${entry.content}`);
  }
  return `${lines.join("\n")}\n`;
}

function ensureWithinBudget(startedAtMs: number, timeBudgetMs: number | undefined, stage: string): void {
  if (typeof timeBudgetMs !== "number" || !Number.isFinite(timeBudgetMs) || timeBudgetMs <= 0) {
    return;
  }
  if (Date.now() - startedAtMs > timeBudgetMs) {
    throw new Error(`transcript_export_time_budget_exceeded:${stage}`);
  }
}

export function ensureBronzeTranscriptExportCached(args: {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
  sessionLabel?: string | null;
  db: any;
  timeBudgetMs?: number;
}): EnsureBronzeTranscriptExportCachedResult {
  /**
   * Bronze transcript source = DB table `bronze_transcript`.
   * Record shape = line_index, author_name, content, timestamp_ms, source_type, source_ids.
   * Canonical ordering = line_index ASC (derived from compile ordering timestamp_ms ASC, id ASC).
   */
  const startedAtMs = Date.now();

  let bronzeStats = readBronzeStats(args.db, args.sessionId);
  if (!bronzeStats) {
    compileBronzeTranscriptIfMissing(args.db, args.sessionId);
    bronzeStats = readBronzeStats(args.db, args.sessionId);
  }
  if (!bronzeStats) {
    throw new Error(`No bronze transcript data found for session ${args.sessionId}`);
  }

  const existing = getSessionArtifact(args.guildId, args.sessionId, "transcript_export");
  const fresh = existing
    ? hasFreshExport({ artifact: existing, bronze: bronzeStats })
    : null;
  if (fresh) {
    return {
      ...fresh,
      cacheHit: true,
    };
  }

  ensureWithinBudget(startedAtMs, args.timeBudgetMs, "pre_build");

  const entries = buildTranscript(args.sessionId, { view: "bronze", primaryOnly: true }, args.db);
  const logText = renderBronzeTranscriptLog(args.sessionId, entries);
  const bytes = Buffer.byteLength(logText, "utf8");
  const hash = createHash("sha256").update(logText, "utf8").digest("hex");

  ensureWithinBudget(startedAtMs, args.timeBudgetMs, "post_render");

  const outputDir = resolveCampaignTranscriptExportsDir(args.campaignSlug, "online", {
    forWrite: true,
    ensureExists: true,
  });
  const stem = buildSessionArtifactStem(args.sessionId, args.sessionLabel);
  const shortSessionId = args.sessionId.slice(0, 8);
  const filePath = path.join(outputDir, `${stem}-${shortSessionId}-transcript-bronze.log`);
  writeFileAtomic(filePath, logText);

  const meta: TranscriptExportMeta = {
    source_row_count: bronzeStats.rowCount,
    source_last_ts_ms: bronzeStats.lastTsMs,
    source_last_line_index: bronzeStats.lastLineIndex,
    export_sha256: hash,
  };

  upsertSessionArtifact({
    guildId: args.guildId,
    sessionId: args.sessionId,
    artifactType: "transcript_export",
    createdAtMs: Date.now(),
    engine: "bronze_transcript_export_v1",
    sourceHash: hash,
    strategy: "default",
    strategyVersion: "v1",
    metaJson: JSON.stringify(meta),
    contentText: null,
    filePath,
    sizeBytes: bytes,
  });

  return {
    path: filePath,
    bytes,
    hash,
    cacheHit: false,
  };
}