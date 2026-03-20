/**
 * Recap Entity Annotation Pipeline
 *
 * Concern B: Recap annotation artifact — stored span structure for one recap version.
 * Concern C: Appearance history — entity/session rollup derived from the annotation artifact.
 *
 * Hard rules:
 * - Annotation artifact is version-aware (tied to session_recaps.updated_at_ms).
 * - When a resolution changes, recompute the FULL annotation artifact for the session (no patching).
 * - Appearance history stores excerpt snapshots, treated as derived and replaceable on refresh.
 */

import { randomUUID } from "node:crypto";
import {
  readSessionRecap,
  findSessionByGuildAndId,
} from "@/lib/server/readData/archiveReadStore";
import { getWebRegistrySnapshot } from "@/lib/server/registryService";
import type { RegistryCategoryKey, RegistryEntityDto } from "@/lib/registry/types";
import type { RecapSpan, RecapTab, AnnotatedRecap, AnnotatedRecapLine, SessionAnnotatedRecaps } from "@/lib/types";
import { getDbForCampaignScope } from "../../../../src/db";
import { normKey } from "../../../../src/registry/loadRegistry";

// ── Recap line parsing ─────────────────────────────────────────────

const RECAP_TABS: RecapTab[] = ["concise", "balanced", "detailed"];

function normalizeRecapLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// ── Entity name → span segmentation ───────────────────────────────

type EntityLookup = {
  id: string;
  canonicalName: string;
  category: RegistryCategoryKey;
  names: string[]; // canonical + aliases, sorted longest first
};

function buildEntityLookup(
  registryCategories: Record<RegistryCategoryKey, RegistryEntityDto[]>,
  resolvedEntities: Map<string, { entityId: string; entityCategory: RegistryCategoryKey }>
): EntityLookup[] {
  // Build set of resolved entity IDs
  const resolvedEntityIds = new Set<string>();
  for (const { entityId } of resolvedEntities.values()) {
    resolvedEntityIds.add(entityId);
  }

  const lookups: EntityLookup[] = [];

  for (const [category, entities] of Object.entries(registryCategories) as Array<
    [RegistryCategoryKey, RegistryEntityDto[]]
  >) {
    for (const entity of entities) {
      if (!resolvedEntityIds.has(entity.id)) continue;

      const names = [entity.canonicalName, ...entity.aliases]
        .filter((n) => n.trim().length > 0)
        .sort((a, b) => b.length - a.length); // longest first for greedy match

      lookups.push({
        id: entity.id,
        canonicalName: entity.canonicalName,
        category,
        names,
      });
    }
  }

  // Sort lookups by longest name first (greedy matching across entities)
  lookups.sort((a, b) => (b.names[0]?.length ?? 0) - (a.names[0]?.length ?? 0));

  return lookups;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function segmentLine(line: string, lookups: EntityLookup[]): RecapSpan[] {
  if (lookups.length === 0) {
    return [{ type: "text", text: line }];
  }

  // Build a combined regex with named groups won't work well, so we use iterative approach
  // Find all entity matches with positions, then segment
  type Match = { start: number; end: number; entityId: string; category: RegistryCategoryKey; text: string };
  const matches: Match[] = [];

  for (const lookup of lookups) {
    for (const name of lookup.names) {
      const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`, "gi");
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(line)) !== null) {
        matches.push({
          start: m.index,
          end: m.index + m[0].length,
          entityId: lookup.id,
          category: lookup.category,
          text: m[0],
        });
      }
    }
  }

  if (matches.length === 0) {
    return [{ type: "text", text: line }];
  }

  // Sort by start position, then longest match first for overlap resolution
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Remove overlapping matches (greedy — keep earliest, longest)
  const resolved: Match[] = [];
  let lastEnd = 0;
  for (const match of matches) {
    if (match.start < lastEnd) continue; // overlaps with previous
    resolved.push(match);
    lastEnd = match.end;
  }

  // Build spans
  const spans: RecapSpan[] = [];
  let cursor = 0;
  for (const match of resolved) {
    if (match.start > cursor) {
      spans.push({ type: "text", text: line.slice(cursor, match.start) });
    }
    spans.push({
      type: "entity",
      text: match.text,
      entityId: match.entityId,
      category: match.category,
    });
    cursor = match.end;
  }
  if (cursor < line.length) {
    spans.push({ type: "text", text: line.slice(cursor) });
  }

  return spans;
}

// ── Core annotation builder ────────────────────────────────────────

type AnnotationInput = {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
  searchParams?: Record<string, string | string[] | undefined>;
};

/**
 * Recompute the full annotation artifact for a session's recap.
 * Called after recap generation/regeneration and after resolution mutations.
 * This is a full rewrite — no surgical patching.
 */
export async function refreshAnnotationsForSession(args: AnnotationInput): Promise<void> {
  const { guildId, campaignSlug, sessionId } = args;

  // Load current recap
  const recap = readSessionRecap({ guildId, campaignSlug, sessionId });
  if (!recap) return; // No recap yet — nothing to annotate

  const recapUpdatedAtMs = recap.updatedAtMs;

  // Load active resolution decisions for this session
  const db = getDbForCampaignScope({ campaignSlug, guildId });
  const activeResolutionRows = db
    .prepare(
      `SELECT er.candidate_name, er.entity_id, er.entity_category, er.updated_at_ms, er.id
       FROM entity_resolutions er
       LEFT JOIN entity_review_batches erb ON erb.id = er.batch_id
       WHERE er.session_id = ?
         AND er.resolution != 'ignored'
         AND (er.batch_id IS NULL OR erb.status = 'applied')
       ORDER BY er.updated_at_ms DESC, er.id DESC`
    )
    .all(sessionId) as Array<{
      candidate_name: string;
      entity_id: string;
      entity_category: string;
      updated_at_ms: number;
      id: string;
    }>;

  const seenCandidates = new Set<string>();
  const resolutions = activeResolutionRows.filter((row) => {
    if (seenCandidates.has(row.candidate_name)) {
      return false;
    }
    seenCandidates.add(row.candidate_name);
    return true;
  });

  if (resolutions.length === 0) {
    // No active resolutions — clear any stale annotations + appearance history
    db.prepare(`DELETE FROM recap_entity_annotations WHERE session_id = ?`).run(sessionId);
    db.prepare(`DELETE FROM entity_appearance_history WHERE session_id = ?`).run(sessionId);
    return;
  }

  // Build resolved entity map: candidateName → { entityId, entityCategory }
  const resolvedEntities = new Map<string, { entityId: string; entityCategory: RegistryCategoryKey }>();
  for (const r of resolutions) {
    resolvedEntities.set(normKey(r.candidate_name), {
      entityId: r.entity_id,
      entityCategory: r.entity_category as RegistryCategoryKey,
    });
  }

  // Load registry for entity name/alias lookup
  const registrySnapshot = await getWebRegistrySnapshot({
    campaignSlug,
    searchParams: args.searchParams,
  });

  const lookups = buildEntityLookup(registrySnapshot.categories, resolvedEntities);

  // Process all recap tabs
  const recapTexts: Record<RecapTab, string> = {
    concise: recap.views.concise,
    balanced: recap.views.balanced,
    detailed: recap.views.detailed,
  };

  // Entity mention tracking for appearance history
  const entityMentions = new Map<string, { count: number; excerpts: string[] }>();

  // Start transaction for atomic replacement
  const insertAnnotation = db.prepare(
    `INSERT INTO recap_entity_annotations (id, session_id, recap_updated_at_ms, recap_tab, line_index, spans_json, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const transaction = db.transaction(() => {
    // Clear all previous annotations for this session (full rewrite)
    db.prepare(`DELETE FROM recap_entity_annotations WHERE session_id = ?`).run(sessionId);

    const now = Date.now();

    for (const tab of RECAP_TABS) {
      const lines = normalizeRecapLines(recapTexts[tab]);
      for (let i = 0; i < lines.length; i++) {
        const spans = segmentLine(lines[i], lookups);

        // Track entity mentions
        for (const span of spans) {
          if (span.type === "entity") {
            const existing = entityMentions.get(span.entityId) ?? { count: 0, excerpts: [] };
            existing.count++;
            if (existing.excerpts.length < 2) {
              const excerpt = lines[i].length > 120 ? lines[i].slice(0, 117) + "..." : lines[i];
              existing.excerpts.push(excerpt);
            }
            entityMentions.set(span.entityId, existing);
          }
        }

        insertAnnotation.run(
          randomUUID(),
          sessionId,
          recapUpdatedAtMs,
          tab,
          i,
          JSON.stringify(spans),
          now
        );
      }
    }
  });

  transaction();

    // ── Concern C: Update appearance history (derived, replaceable) ──

    const session = findSessionByGuildAndId({ guildId, campaignSlug, sessionId });
    const sessionLabel = session?.label ?? null;
    const sessionDate = session
      ? new Date(session.started_at_ms).toISOString().slice(0, 10)
      : null;

    const insertAppearance = db.prepare(
      `INSERT INTO entity_appearance_history (id, entity_id, session_id, guild_id, campaign_slug, recap_updated_at_ms, session_label, session_date, excerpt, mention_count, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(entity_id, session_id)
       DO UPDATE SET
         recap_updated_at_ms = excluded.recap_updated_at_ms,
         session_label = excluded.session_label,
         session_date = excluded.session_date,
         excerpt = excluded.excerpt,
         mention_count = excluded.mention_count,
         updated_at_ms = excluded.updated_at_ms`
    );

    const now = Date.now();
    const staleEntityIds = new Set(
      (db
        .prepare(`SELECT DISTINCT entity_id FROM entity_appearance_history WHERE session_id = ?`)
        .all(sessionId) as Array<{ entity_id: string }>)
        .map((r) => r.entity_id)
    );

    for (const [entityId, { count, excerpts }] of entityMentions) {
      insertAppearance.run(
        randomUUID(),
        entityId,
        sessionId,
        guildId,
        campaignSlug,
        recapUpdatedAtMs,
        sessionLabel,
        sessionDate,
        excerpts[0] ?? null,
        count,
        now,
        now
      );
      staleEntityIds.delete(entityId);
    }

    // Remove stale appearance rows for entities no longer mentioned
    if (staleEntityIds.size > 0) {
      for (const entityId of staleEntityIds) {
        db.prepare(`DELETE FROM entity_appearance_history WHERE entity_id = ? AND session_id = ?`).run(
          entityId,
          sessionId
        );
      }
    }
}

// ── Read annotations ───────────────────────────────────────────────

export function readAnnotatedRecaps(args: {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
}): SessionAnnotatedRecaps | null {
  const db = getDbForCampaignScope({ campaignSlug: args.campaignSlug, guildId: args.guildId });
  const rows = db
    .prepare(
      `SELECT recap_tab, line_index, spans_json, recap_updated_at_ms
       FROM recap_entity_annotations
       WHERE session_id = ?
       ORDER BY recap_tab, line_index ASC`
    )
    .all(args.sessionId) as Array<{
      recap_tab: RecapTab;
      line_index: number;
      spans_json: string;
      recap_updated_at_ms: number;
    }>;

    if (rows.length === 0) return null;

    // Also load the raw recap to fill in raw text
    const recap = readSessionRecap(args);
    if (!recap) return null;

    const recapTexts: Record<RecapTab, string[]> = {
      concise: normalizeRecapLines(recap.views.concise),
      balanced: normalizeRecapLines(recap.views.balanced),
      detailed: normalizeRecapLines(recap.views.detailed),
    };

    // Check version alignment
    const annotationVersion = rows[0].recap_updated_at_ms;
    if (annotationVersion !== recap.updatedAtMs) {
      // Stale annotations — return null so caller knows to regenerate
      return null;
    }

    const result: SessionAnnotatedRecaps = {
      concise: null,
      balanced: null,
      detailed: null,
    };

    // Group rows by tab
    const byTab = new Map<RecapTab, typeof rows>();
    for (const row of rows) {
      const existing = byTab.get(row.recap_tab) ?? [];
      existing.push(row);
      byTab.set(row.recap_tab, existing);
    }

    for (const tab of RECAP_TABS) {
      const tabRows = byTab.get(tab);
      if (!tabRows || tabRows.length === 0) continue;

      const rawLines = recapTexts[tab];
      const lines: AnnotatedRecapLine[] = tabRows.map((row) => ({
        lineIndex: row.line_index,
        raw: rawLines[row.line_index] ?? "",
        spans: JSON.parse(row.spans_json) as RecapSpan[],
      }));

      result[tab] = {
        recapUpdatedAt: new Date(annotationVersion).toISOString(),
        lines,
      };
    }

  return result;
}

// ── Read appearance history ────────────────────────────────────────

export type AppearanceRow = {
  session_id: string;
  session_label: string | null;
  session_date: string | null;
  excerpt: string | null;
  mention_count: number;
};

export function readEntityAppearances(args: {
  guildId: string;
  campaignSlug: string;
  entityId: string;
}): AppearanceRow[] {
  const db = getDbForCampaignScope({ campaignSlug: args.campaignSlug, guildId: args.guildId });
  return db
    .prepare(
      `SELECT session_id, session_label, session_date, excerpt, mention_count
       FROM entity_appearance_history
       WHERE entity_id = ? AND guild_id = ? AND campaign_slug = ?
       ORDER BY session_date ASC`
    )
    .all(args.entityId, args.guildId, args.campaignSlug) as AppearanceRow[];
}
