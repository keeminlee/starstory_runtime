import { normKey } from "./loadRegistry.js";
import type { LoadedRegistry } from "./types.js";

export type ScanSourceRow = {
  content: string;
  narrative_weight: string;
  source?: string;
};

export type PendingCandidate = {
  key: string;
  display: string;
  count: number;
  primaryCount: number;
  sentenceInitialCount: number;
  examples: string[];
  sessions?: Array<{ sessionId: string; count: number; primaryCount: number }>;
};

export type KnownHitSummary = {
  canonical_name: string;
  count: number;
  primaryCount: number;
  sessions?: Array<{ sessionId: string; count: number; primaryCount: number }>;
};

export type ScanNamesCoreInput = {
  rows: ScanSourceRow[];
  registry: Pick<LoadedRegistry, "characters" | "ignore" | "byName">;
  minCount: number;
  maxExamples: number;
  includeKnown: boolean;
};

export type ScanNamesCoreOutput = {
  pending: PendingCandidate[];
  knownHits: KnownHitSummary[];
};

export type SessionScanInput = {
  sessionId: string;
  rows: ScanSourceRow[];
};

export type PerSessionInput = {
  sessionRows: SessionScanInput[];
  registry: Pick<LoadedRegistry, "characters" | "ignore" | "byName">;
  minCount: number;
  maxExamples: number;
  includeKnown: boolean;
};

const NAME_PHRASE_RE = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPrimaryWeight(weight: string): boolean {
  return weight === "primary" || weight === "elevated";
}

/**
 * Determines whether a match at `matchIndex` within `content` is at a
 * sentence-initial position (start of string, after sentence-ending
 * punctuation, after newline, or after bullet/list markers).
 */
export function isSentenceInitial(content: string, matchIndex: number): boolean {
  if (matchIndex === 0) return true;

  const before = content.slice(0, matchIndex);
  const trimmed = before.trimEnd();
  if (trimmed.length === 0) return true;

  const lastChar = trimmed[trimmed.length - 1];

  // After sentence-ending punctuation
  if (lastChar === "." || lastChar === "!" || lastChar === "?") return true;

  // After newline in the gap between last non-space char and match
  const gap = before.slice(trimmed.length);
  if (gap.includes("\n")) return true;

  // After bullet / list markers (- , * , •, or numbered like 1. 2) )
  if (/[-*•]\s*$/.test(before)) return true;
  if (/\d+[.)]\s*$/.test(before)) return true;

  return false;
}

export function pickTranscriptRows(
  ledgerRows: ScanSourceRow[],
  bronzeRows: ScanSourceRow[],
): { rows: ScanSourceRow[]; source: "ledger_entries" | "bronze_transcript" } {
  if (bronzeRows.length > 0) {
    return { rows: bronzeRows, source: "bronze_transcript" };
  }
  return { rows: ledgerRows, source: "ledger_entries" };
}

export function scanNamesCore(input: ScanNamesCoreInput): ScanNamesCoreOutput {
  const candidates = new Map<string, PendingCandidate>();
  const knownHits = new Map<string, { count: number; primaryCount: number }>();

  const knownNamePatterns = new Map<string, RegExp>();
  for (const character of input.registry.characters) {
    const canonicalKey = normKey(character.canonical_name);
    if (canonicalKey && !knownNamePatterns.has(canonicalKey)) {
      knownNamePatterns.set(canonicalKey, new RegExp(`\\b${escapeRegex(canonicalKey)}\\b`, "i"));
    }

    for (const alias of character.aliases) {
      const aliasKey = normKey(alias);
      if (aliasKey && !knownNamePatterns.has(aliasKey)) {
        knownNamePatterns.set(aliasKey, new RegExp(`\\b${escapeRegex(aliasKey)}\\b`, "i"));
      }
    }
  }

  for (const row of input.rows) {
    const content = row.content.trim();
    const isPrimary = isPrimaryWeight(row.narrative_weight);

    // Phase 1: Collect all phrase matches with positions, longest phrase wins.
    // The regex inherently captures the longest contiguous capitalized phrase,
    // so child tokens within a matched span are never separately counted.
    for (const match of content.matchAll(NAME_PHRASE_RE)) {
      const display = match[0].trim();
      const matchIndex = match.index!;
      const key = normKey(display);
      if (!key) continue;
      if (input.registry.ignore.has(key)) continue;
      if (input.registry.byName.has(key)) continue;

      const words = key.split(/\s+/);
      if (words.some((word) => input.registry.byName.has(word))) continue;

      if (display.startsWith("The ")) {
        const restWords = display.slice(4).split(/\s+/).length;
        if (restWords <= 2) continue;
      }

      if (key.match(/\d/) || key.match(/[^a-z0-9\s]/i)) continue;

      const tokens = key.split(/\s+/);
      const allIgnored = tokens.every((token) => input.registry.ignore.has(token));
      if (allIgnored) continue;

      if (!candidates.has(key)) {
        candidates.set(key, {
          key,
          display,
          count: 0,
          primaryCount: 0,
          sentenceInitialCount: 0,
          examples: [],
        });
      }

      const candidate = candidates.get(key)!;

      // Sentence-initial occurrences tracked separately, not counted toward minCount
      if (isSentenceInitial(content, matchIndex)) {
        candidate.sentenceInitialCount += 1;
      } else {
        candidate.count += 1;
        if (isPrimary) {
          candidate.primaryCount += 1;
        }
      }

      if (candidate.examples.length < input.maxExamples) {
        candidate.examples.push(content);
      }
    }
  }

  if (input.includeKnown) {
    for (const row of input.rows) {
      const content = row.content.toLowerCase();
      const isPrimary = isPrimaryWeight(row.narrative_weight);

      for (const [nameKey, pattern] of knownNamePatterns) {
        if (!pattern.test(content)) continue;

        if (!knownHits.has(nameKey)) {
          knownHits.set(nameKey, { count: 0, primaryCount: 0 });
        }
        const hit = knownHits.get(nameKey)!;
        hit.count += 1;
        if (isPrimary) {
          hit.primaryCount += 1;
        }
      }
    }
  }

  const pending = Array.from(candidates.values())
    .filter((candidate) => candidate.count >= input.minCount)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.primaryCount !== a.primaryCount) return b.primaryCount - a.primaryCount;
      return a.key.localeCompare(b.key);
    });

  const knownByCharacterId = new Map<string, KnownHitSummary>();
  if (input.includeKnown) {
    for (const [nameKey, hits] of knownHits) {
      const entity = input.registry.byName.get(nameKey);
      if (!entity || knownByCharacterId.has(entity.id)) continue;

      let count = 0;
      let primaryCount = 0;
      for (const [otherKey, otherHits] of knownHits) {
        const otherEntity = input.registry.byName.get(otherKey);
        if (!otherEntity || otherEntity.id !== entity.id) continue;
        count += otherHits.count;
        primaryCount += otherHits.primaryCount;
      }

      knownByCharacterId.set(entity.id, {
        canonical_name: (entity as { canonical_name: string }).canonical_name,
        count,
        primaryCount,
      });
    }
  }

  const knownHitsList = Array.from(knownByCharacterId.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.primaryCount !== a.primaryCount) return b.primaryCount - a.primaryCount;
    return a.canonical_name.localeCompare(b.canonical_name);
  });

  return {
    pending,
    knownHits: knownHitsList,
  };
}

/**
 * Runs scanNamesCore per-session, then aggregates candidates and known hits
 * across sessions with a campaign-global minCount threshold.
 * Returns per-candidate session breakdowns and per-entity session breakdowns.
 */
export function scanNamesCorePerSession(input: PerSessionInput): ScanNamesCoreOutput {
  const globalCandidates = new Map<
    string,
    PendingCandidate & { sessionMap: Map<string, { count: number; primaryCount: number }> }
  >();
  const globalKnownHits = new Map<
    string,
    KnownHitSummary & { sessionMap: Map<string, { count: number; primaryCount: number }> }
  >();

  for (const session of input.sessionRows) {
    const result = scanNamesCore({
      rows: session.rows,
      registry: input.registry,
      minCount: 1,
      maxExamples: input.maxExamples,
      includeKnown: input.includeKnown,
    });

    for (const pending of result.pending) {
      let global = globalCandidates.get(pending.key);
      if (!global) {
        global = {
          ...pending,
          sessionMap: new Map(),
        };
        globalCandidates.set(pending.key, global);
      } else {
        global.count += pending.count;
        global.primaryCount += pending.primaryCount;
        global.sentenceInitialCount += pending.sentenceInitialCount;
        for (const ex of pending.examples) {
          if (global.examples.length < input.maxExamples) {
            global.examples.push(ex);
          }
        }
      }
      global.sessionMap.set(session.sessionId, {
        count: pending.count,
        primaryCount: pending.primaryCount,
      });
    }

    for (const hit of result.knownHits) {
      let global = globalKnownHits.get(hit.canonical_name);
      if (!global) {
        global = {
          ...hit,
          sessionMap: new Map(),
        };
        globalKnownHits.set(hit.canonical_name, global);
      } else {
        global.count += hit.count;
        global.primaryCount += hit.primaryCount;
      }
      global.sessionMap.set(session.sessionId, {
        count: hit.count,
        primaryCount: hit.primaryCount,
      });
    }
  }

  const pending = Array.from(globalCandidates.values())
    .filter((c) => c.count >= input.minCount)
    .map((c) => ({
      key: c.key,
      display: c.display,
      count: c.count,
      primaryCount: c.primaryCount,
      sentenceInitialCount: c.sentenceInitialCount,
      examples: c.examples,
      sessions: Array.from(c.sessionMap.entries())
        .map(([sessionId, counts]) => ({ sessionId, ...counts }))
        .sort((a, b) => b.count - a.count || a.sessionId.localeCompare(b.sessionId)),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.primaryCount !== a.primaryCount) return b.primaryCount - a.primaryCount;
      return a.key.localeCompare(b.key);
    });

  const knownHits = Array.from(globalKnownHits.values())
    .map((h) => ({
      canonical_name: h.canonical_name,
      count: h.count,
      primaryCount: h.primaryCount,
      sessions: Array.from(h.sessionMap.entries())
        .map(([sessionId, counts]) => ({ sessionId, ...counts }))
        .sort((a, b) => b.count - a.count || a.sessionId.localeCompare(b.sessionId)),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.primaryCount !== a.primaryCount) return b.primaryCount - a.primaryCount;
      return a.canonical_name.localeCompare(b.canonical_name);
    });

  return { pending, knownHits };
}