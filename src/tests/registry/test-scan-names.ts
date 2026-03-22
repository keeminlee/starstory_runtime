import { expect, test } from "vitest";
import {
  isSentenceInitial,
  pickTranscriptRows,
  scanNamesCore,
  scanNamesCorePerSession,
} from "../../registry/scanNamesCore.js";

const alice = {
  id: "npc_alice",
  canonical_name: "Alice",
  aliases: ["Al"],
  type: "npc" as const,
};

function makeRegistry() {
  return {
    characters: [alice],
    ignore: new Set<string>(["the", "and", "thanks"]),
    byName: new Map<string, any>([
      ["alice", alice],
      ["al", alice],
    ]),
  };
}

test("scanNamesCore yields deterministic candidate ordering", () => {
  const registry = makeRegistry();
  // Both names appear mid-sentence so they're counted normally
  const rows = [
    { content: "I think Bob Stone and Cara Vale enter.", narrative_weight: "primary", source: "voice" },
    { content: "so Cara Vale and Bob Stone argue.", narrative_weight: "elevated", source: "voice" },
    { content: "it is dark in the keep.", narrative_weight: "primary", source: "voice" },
  ];

  const output = scanNamesCore({
    rows,
    registry,
    minCount: 2,
    maxExamples: 2,
    includeKnown: false,
  });

  expect(output.pending.map((item) => item.key)).toEqual(["bob stone", "cara vale"]);
  expect(output.pending[0]?.count).toBe(2);
  expect(output.pending[1]?.count).toBe(2);
  expect(output.pending[0]?.sentenceInitialCount).toBe(0);
  expect(output.knownHits).toEqual([]);
});

test("scanNamesCore aggregates known hits when requested", () => {
  const registry = makeRegistry();
  const rows = [
    { content: "Alice meets the party.", narrative_weight: "primary", source: "voice" },
    { content: "Al returns with news.", narrative_weight: "elevated", source: "voice" },
    { content: "Alice and Al both speak.", narrative_weight: "primary", source: "voice" },
  ];

  const output = scanNamesCore({
    rows,
    registry,
    minCount: 99,
    maxExamples: 3,
    includeKnown: true,
  });

  expect(output.pending).toEqual([]);
  expect(output.knownHits).toEqual([
    {
      canonical_name: "Alice",
      count: 4,
      primaryCount: 4,
    },
  ]);
});

test("pickTranscriptRows prefers bronze over ledger", () => {
  const ledgerRows = [{ content: "ledger", narrative_weight: "primary", source: "ledger" }];
  const bronzeRows = [{ content: "bronze", narrative_weight: "primary", source: "bronze" }];

  const preferred = pickTranscriptRows(ledgerRows, bronzeRows);
  expect(preferred.source).toBe("bronze_transcript");
  expect(preferred.rows).toEqual(bronzeRows);

  const fallback = pickTranscriptRows(ledgerRows, []);
  expect(fallback.source).toBe("ledger_entries");
  expect(fallback.rows).toEqual(ledgerRows);
});

// ── Sentence-initial filtering ──────────────────────────────────────

test("isSentenceInitial detects start of string", () => {
  expect(isSentenceInitial("Bob walked away.", 0)).toBe(true);
});

test("isSentenceInitial detects after period", () => {
  expect(isSentenceInitial("Done. Bob walked away.", 6)).toBe(true);
});

test("isSentenceInitial detects after newline", () => {
  expect(isSentenceInitial("First line.\nBob walked away.", 12)).toBe(true);
});

test("isSentenceInitial detects after bullet marker", () => {
  expect(isSentenceInitial("- Bob walked away.", 2)).toBe(true);
  expect(isSentenceInitial("* Bob walked away.", 2)).toBe(true);
  expect(isSentenceInitial("1. Bob walked away.", 3)).toBe(true);
});

test("isSentenceInitial returns false mid-sentence", () => {
  expect(isSentenceInitial("I think Bob walked away.", 8)).toBe(false);
});

test("sentence-initial phrase not counted toward minCount", () => {
  const registry = makeRegistry();
  const rows = [
    { content: "Bastion stood tall.", narrative_weight: "primary", source: "voice" },
    { content: "Bastion moved east.", narrative_weight: "primary", source: "voice" },
  ];

  const output = scanNamesCore({
    rows,
    registry,
    minCount: 1,
    maxExamples: 3,
    includeKnown: false,
  });

  // Both occurrences are sentence-initial → count=0, sentenceInitialCount=2
  const bastion = output.pending.find((c) => c.key === "bastion");
  expect(bastion).toBeUndefined(); // filtered out by minCount=1 since count=0
});

test("mid-sentence phrase counts normally", () => {
  const registry = makeRegistry();
  const rows = [
    { content: "a warrior called Bastion fought bravely.", narrative_weight: "primary", source: "voice" },
    { content: "so Bastion retreated to camp.", narrative_weight: "primary", source: "voice" },
  ];

  const output = scanNamesCore({
    rows,
    registry,
    minCount: 1,
    maxExamples: 3,
    includeKnown: false,
  });

  const bastion = output.pending.find((c) => c.key === "bastion");
  expect(bastion).toBeDefined();
  expect(bastion!.count).toBe(2);
  expect(bastion!.sentenceInitialCount).toBe(0);
});

test("mixed position phrase tracks both counts", () => {
  const registry = makeRegistry();
  const rows = [
    { content: "Bastion stood tall.", narrative_weight: "primary", source: "voice" },
    { content: "a warrior called Bastion fought.", narrative_weight: "primary", source: "voice" },
    { content: "Bastion moved east.", narrative_weight: "primary", source: "voice" },
    { content: "so Bastion retreated to camp.", narrative_weight: "primary", source: "voice" },
  ];

  const output = scanNamesCore({
    rows,
    registry,
    minCount: 1,
    maxExamples: 5,
    includeKnown: false,
  });

  const bastion = output.pending.find((c) => c.key === "bastion");
  expect(bastion).toBeDefined();
  expect(bastion!.count).toBe(2);               // 2 mid-sentence
  expect(bastion!.sentenceInitialCount).toBe(2); // 2 sentence-initial
});

// ── Phrase-first span behavior ──────────────────────────────────────

test("regex captures longest contiguous phrase — shorter tokens not double-counted", () => {
  const registry = makeRegistry();
  const rows = [
    { content: "I saw Ismuhar Bastion approaching.", narrative_weight: "primary", source: "voice" },
    { content: "so Bastion appeared alone.", narrative_weight: "primary", source: "voice" },
  ];

  const output = scanNamesCore({
    rows,
    registry,
    minCount: 1,
    maxExamples: 3,
    includeKnown: false,
  });

  const keys = output.pending.map((c) => c.key);
  expect(keys).toContain("ismuhar bastion");
  expect(keys).toContain("bastion");
  // Both are independent candidates with correct counts
  expect(output.pending.find((c) => c.key === "ismuhar bastion")!.count).toBe(1);
  expect(output.pending.find((c) => c.key === "bastion")!.count).toBe(1);
});

test("standalone shorter name survives independently from its long-phrase occurrence", () => {
  const registry = makeRegistry();
  const rows = [
    { content: "I met Elara Thorne at the gate.", narrative_weight: "primary", source: "voice" },
    { content: "so Elara smiled at me.", narrative_weight: "primary", source: "voice" },
    { content: "I found Elara waiting.", narrative_weight: "primary", source: "voice" },
  ];

  const output = scanNamesCore({
    rows,
    registry,
    minCount: 1,
    maxExamples: 3,
    includeKnown: false,
  });

  const elara = output.pending.find((c) => c.key === "elara");
  const elaraThorne = output.pending.find((c) => c.key === "elara thorne");
  expect(elara).toBeDefined();
  expect(elaraThorne).toBeDefined();
  expect(elara!.count).toBe(2);        // 2 standalone mid-sentence
  expect(elaraThorne!.count).toBe(1);  // 1 full phrase mid-sentence
});

// ── Per-session aggregation ─────────────────────────────────────────

test("scanNamesCorePerSession aggregates across sessions with minCount threshold", () => {
  const registry = makeRegistry();

  const output = scanNamesCorePerSession({
    sessionRows: [
      {
        sessionId: "s1",
        rows: [
          { content: "a warrior called Bastion fought.", narrative_weight: "primary", source: "voice" },
          { content: "so Bastion returned to camp.", narrative_weight: "primary", source: "voice" },
        ],
      },
      {
        sessionId: "s2",
        rows: [
          { content: "once more Bastion appeared.", narrative_weight: "primary", source: "voice" },
        ],
      },
    ],
    registry,
    minCount: 3,
    maxExamples: 3,
    includeKnown: false,
  });

  const bastion = output.pending.find((c) => c.key === "bastion");
  expect(bastion).toBeDefined();
  expect(bastion!.count).toBe(3);
  expect(bastion!.sessions).toEqual([
    { sessionId: "s1", count: 2, primaryCount: 2 },
    { sessionId: "s2", count: 1, primaryCount: 1 },
  ]);
});

test("scanNamesCorePerSession filters below minCount threshold", () => {
  const registry = makeRegistry();

  const output = scanNamesCorePerSession({
    sessionRows: [
      {
        sessionId: "s1",
        rows: [
          { content: "a warrior called Bastion fought.", narrative_weight: "primary", source: "voice" },
        ],
      },
    ],
    registry,
    minCount: 3,
    maxExamples: 3,
    includeKnown: false,
  });

  expect(output.pending).toEqual([]);
});

test("scanNamesCorePerSession aggregates known hits with session breakdown", () => {
  const registry = makeRegistry();

  const output = scanNamesCorePerSession({
    sessionRows: [
      {
        sessionId: "s1",
        rows: [
          { content: "Alice spoke loudly.", narrative_weight: "primary", source: "voice" },
        ],
      },
      {
        sessionId: "s2",
        rows: [
          { content: "Alice returned.", narrative_weight: "primary", source: "voice" },
          { content: "Al helped.", narrative_weight: "primary", source: "voice" },
        ],
      },
    ],
    registry,
    minCount: 1,
    maxExamples: 3,
    includeKnown: true,
  });

  expect(output.knownHits.length).toBe(1);
  const aliceHit = output.knownHits[0];
  expect(aliceHit.canonical_name).toBe("Alice");
  expect(aliceHit.count).toBe(3);
  expect(aliceHit.sessions).toBeDefined();
  expect(aliceHit.sessions!.length).toBe(2);
});
