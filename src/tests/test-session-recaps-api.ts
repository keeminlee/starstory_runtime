import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { RecapStrategy } from "../sessions/recapEngine.js";
import { ensureRegistryScaffold, getRegistryDirForScope } from "../registry/scaffold.js";

const tempDirs: string[] = [];

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup on Windows where sqlite WAL handles can linger briefly.
      }
    }
  }
});

async function seedSessionAndLedger(guildId: string, sessionId: string): Promise<void> {
  const { getDbForCampaign } = await import("../db.js");
  const { resolveCampaignSlug } = await import("../campaign/guildConfig.js");
  const db = getDbForCampaign(resolveCampaignSlug({ guildId }));
  const now = Date.now();

  db.prepare(
    `
      INSERT INTO sessions (
        session_id, guild_id, kind, mode_at_start, status, label,
        created_at_ms, started_at_ms, ended_at_ms, ended_reason,
        started_by_id, started_by_name, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    sessionId,
    guildId,
    "canon",
    "canon",
    "completed",
    "Recap API Test",
    now - 10_000,
    now - 9_000,
    now - 1_000,
    "test_end",
    "user-1",
    "Tester",
    "live"
  );

  db.prepare(
    `
      INSERT INTO ledger_entries (
        id, guild_id, channel_id, message_id, author_id, author_name,
        timestamp_ms, content, content_norm, session_id, tags,
        source, narrative_weight
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    `${sessionId}-entry-1`,
    guildId,
    "channel-1",
    `${sessionId}-msg-1`,
    "user-1",
    "Player",
    now - 8_000,
    "We enter the keep.",
    "We enter the keep.",
    sessionId,
    "human",
    "text",
    "primary"
  );

  db.prepare(
    `
      INSERT INTO ledger_entries (
        id, guild_id, channel_id, message_id, author_id, author_name,
        timestamp_ms, content, content_norm, session_id, tags,
        source, narrative_weight
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    `${sessionId}-entry-2`,
    guildId,
    "channel-1",
    `${sessionId}-msg-2`,
    "user-2",
    "DM",
    now - 7_000,
    "A hidden door opens.",
    "A hidden door opens.",
    sessionId,
    "human",
    "voice",
    "primary"
  );
}

async function markSpeakerAttributionReady(guildId: string, sessionId: string): Promise<void> {
  const { setGuildDmUserId } = await import("../campaign/guildConfig.js");
  const { setSessionSpeakerClassifications } = await import("../sessions/sessionSpeakerAttribution.js");

  setGuildDmUserId(guildId, "user-2");
  setSessionSpeakerClassifications({
    guildId,
    sessionId,
    entries: [
      {
        discordUserId: "user-1",
        classificationType: "ignore",
      },
    ],
  });
}

function seedPcRegistry(guildId: string, campaignSlug: string, discordUserId = "user-1"): void {
  const registryDir = getRegistryDirForScope({ guildId, campaignSlug });
  ensureRegistryScaffold(registryDir);
  fs.writeFileSync(
    path.join(registryDir, "pcs.yml"),
    [
      "version: 1",
      "",
      "characters:",
      "  - id: pc_test_user",
      "    canonical_name: Test User",
      "    aliases:",
      "      - Tester",
      `    discord_user_id: ${discordUserId}`,
      "    notes: Test PC",
      "",
    ].join("\n"),
    "utf8"
  );
}

function buildStyleRecapResult(args: {
  strategy: RecapStrategy;
  text?: string;
  createdAtMs?: number;
  sourceTranscriptHash?: string;
  llmProvider?: "openai" | "anthropic" | "google" | null;
  llmModel?: string | null;
}) {
  return {
    text: args.text ?? `${args.strategy}-output`,
    createdAtMs: args.createdAtMs ?? Date.now(),
    strategy: args.strategy,
    engine: "megameecap" as const,
    strategyVersion: "megameecap-final-v1",
    llmProvider: args.llmProvider ?? "openai",
    llmModel: args.llmModel ?? "gpt-4o-mini",
    baseVersion: "megameecap-base-v1",
    finalVersion: "megameecap-final-v1",
    sourceTranscriptHash: args.sourceTranscriptHash ?? `hash-${args.strategy}`,
    cacheHit: false,
    artifactPaths: {
      recapPath: `${args.strategy}.md`,
      metaPath: `${args.strategy}.json`,
    },
  };
}

test("sessionRecaps upsert/get round-trip preserves canonical three-view shape", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-recaps-api-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-recaps-api";
  const sessionId = "session-recaps-api";
  await seedSessionAndLedger(guildId, sessionId);

  const { getSessionRecap, upsertSessionRecap } = await import("../sessions/sessionRecaps.js");

  const before = getSessionRecap(guildId, sessionId);
  expect(before).toBeNull();

  const created = upsertSessionRecap({
    guildId,
    sessionId,
    engine: "megameecap",
    sourceHash: "hash-abc",
    strategyVersion: "session-recaps-v2",
    metaJson: JSON.stringify({ run: "run1", llm_provider: "anthropic", llm_model: "claude-haiku-4-5" }),
    views: {
      concise: "Concise recap",
      balanced: "Balanced recap",
      detailed: "Detailed recap",
    },
  });

  expect(created.sessionId).toBe(sessionId);
  expect(created.views.concise).toBe("Concise recap");
  expect(created.views.balanced).toBe("Balanced recap");
  expect(created.views.detailed).toBe("Detailed recap");
  expect(created.llmProvider).toBe("anthropic");
  expect(created.llmModel).toBe("claude-haiku-4-5");

  const loaded = getSessionRecap(guildId, sessionId);
  expect(loaded).toBeTruthy();
  expect(loaded?.views.concise).toBe("Concise recap");
  expect(loaded?.views.balanced).toBe("Balanced recap");
  expect(loaded?.views.detailed).toBe("Detailed recap");
  expect(loaded?.sourceHash).toBe("hash-abc");
  expect(loaded?.llmProvider).toBe("anthropic");
  expect(loaded?.llmModel).toBe("claude-haiku-4-5");
});

test("getSessionRecap falls back to legacy session_artifacts recap when canonical row is missing", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-recaps-legacy-artifact-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-recaps-legacy-artifact";
  const sessionId = "session-recaps-legacy-artifact";
  await seedSessionAndLedger(guildId, sessionId);

  const { getDbForCampaign } = await import("../db.js");
  const { resolveCampaignSlug } = await import("../campaign/guildConfig.js");
  const db = getDbForCampaign(resolveCampaignSlug({ guildId }));
  const now = Date.now();

  db.exec(`
    CREATE TABLE IF NOT EXISTS session_artifacts (
      session_id TEXT,
      artifact_type TEXT,
      content_text TEXT,
      created_at_ms INTEGER,
      engine TEXT,
      source_hash TEXT,
      strategy_version TEXT,
      meta_json TEXT
    )
  `);

  db.prepare(
    `
      INSERT INTO session_artifacts (
        session_id, artifact_type, content_text, created_at_ms,
        engine, source_hash, strategy_version, meta_json
      ) VALUES (?, 'recap_final', ?, ?, ?, ?, ?, ?)
    `
  ).run(
    sessionId,
    "Legacy artifact recap body",
    now,
    "megameecap",
    "hash-legacy-artifact",
    "legacy-artifact-v1",
    JSON.stringify({ legacy: true })
  );

  const { getSessionRecap } = await import("../sessions/sessionRecaps.js");
  const loaded = getSessionRecap(guildId, sessionId);

  expect(loaded).toBeTruthy();
  expect(loaded?.views.concise).toBe("");
  expect(loaded?.views.balanced).toBe("Legacy artifact recap body");
  expect(loaded?.views.detailed).toBe("");
  expect(loaded?.modelVersion).toBe("legacy-artifact-v1");
  expect(loaded?.sourceHash).toBe("hash-legacy-artifact");
  expect(loaded?.llmModel).toBeNull();
});

test("getSessionRecap falls back to legacy meecaps narrative when canonical row is missing", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-recaps-legacy-meecap-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-recaps-legacy-meecap";
  const sessionId = "session-recaps-legacy-meecap";
  await seedSessionAndLedger(guildId, sessionId);

  const { getDbForCampaign } = await import("../db.js");
  const { resolveCampaignSlug } = await import("../campaign/guildConfig.js");
  const db = getDbForCampaign(resolveCampaignSlug({ guildId }));
  const now = Date.now();

  db.exec(`
    CREATE TABLE IF NOT EXISTS meecaps (
      session_id TEXT,
      created_at_ms INTEGER,
      updated_at_ms INTEGER,
      model TEXT,
      meecap_narrative TEXT,
      meecap_json TEXT
    )
  `);

  db.prepare(
    `
      INSERT INTO meecaps (
        session_id, created_at_ms, updated_at_ms, model, meecap_narrative, meecap_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run(
    sessionId,
    now - 1000,
    now,
    "legacy-model",
    "Legacy meecap narrative body",
    JSON.stringify({ legacy: true })
  );

  const { getSessionRecap } = await import("../sessions/sessionRecaps.js");
  const loaded = getSessionRecap(guildId, sessionId);

  expect(loaded).toBeTruthy();
  expect(loaded?.views.concise).toBe("");
  expect(loaded?.views.balanced).toBe("Legacy meecap narrative body");
  expect(loaded?.views.detailed).toBe("");
  expect(loaded?.modelVersion).toBe("session-recaps-legacy-meecap-v1");
  expect(loaded?.engine).toBe("legacy-model");
  expect(loaded?.llmModel).toBe("legacy-model");
});

test("sessionTranscript returns normalized transcript line contract", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-transcript-api-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-transcript-api";
  const sessionId = "session-transcript-api";
  await seedSessionAndLedger(guildId, sessionId);

  const { getSessionTranscript } = await import("../sessions/sessionTranscript.js");

  const transcript = getSessionTranscript({
    guildId,
    sessionId,
    view: "raw",
    primaryOnly: true,
  });

  expect(transcript.guildId).toBe(guildId);
  expect(transcript.sessionId).toBe(sessionId);
  expect(transcript.lineCount).toBeGreaterThan(0);
  expect(transcript.lines[0]?.lineIndex).toBe(0);
  expect(typeof transcript.lines[0]?.speaker).toBe("string");
  expect(typeof transcript.lines[0]?.text).toBe("string");
});

test("generateSessionRecap orchestrates all three styles and persists session_recaps contract", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-recaps-generate-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-recaps-generate";
  const sessionId = "session-recaps-generate";
  await seedSessionAndLedger(guildId, sessionId);
  await markSpeakerAttributionReady(guildId, sessionId);

  const {
    generateSessionRecap,
    getSessionRecap,
  } = await import("../sessions/sessionRecaps.js");

  const styleCalls: RecapStrategy[] = [];
  const generated = await generateSessionRecap(
    {
      guildId,
      sessionId,
    },
    {
      generateStyleRecap: async ({ strategy }) => {
        styleCalls.push(strategy);
        return {
          ...buildStyleRecapResult({
            strategy,
            text: `${strategy.toUpperCase()} recap output`,
            llmProvider: "anthropic",
            llmModel: "claude-haiku-4-5",
          }),
          sourceRange: {
            startLine: 0,
            endLine: 2,
            lineCount: 3,
          },
        };
      },
    }
  );

  expect(styleCalls).toEqual(["concise", "balanced", "detailed"]);
  expect(generated.views.concise).toContain("CONCISE");
  expect(generated.views.balanced).toContain("BALANCED");
  expect(generated.views.detailed).toContain("DETAILED");
  expect(generated.generatedAt).toBeGreaterThan(0);
  expect(generated.modelVersion).toBe("megameecap-final-v1");
  expect(generated.llmProvider).toBe("anthropic");
  expect(generated.llmModel).toBe("claude-haiku-4-5");
  expect(generated.metaJson).toContain('"llm_provider":"anthropic"');
  expect(generated.metaJson).toContain('"llm_model":"claude-haiku-4-5"');

  const loaded = getSessionRecap(guildId, sessionId);
  expect(loaded).toBeTruthy();
  expect(loaded?.views.concise).toContain("CONCISE");
  expect(loaded?.views.balanced).toContain("BALANCED");
  expect(loaded?.views.detailed).toContain("DETAILED");
  expect(loaded?.modelVersion).toBe("megameecap-final-v1");
  expect(loaded?.llmProvider).toBe("anthropic");
  expect(loaded?.llmModel).toBe("claude-haiku-4-5");
});

test("regenerateSessionRecap overwrites safely and records regeneration reason", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-recaps-regenerate-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-recaps-regenerate";
  const sessionId = "session-recaps-regenerate";
  await seedSessionAndLedger(guildId, sessionId);
  await markSpeakerAttributionReady(guildId, sessionId);

  const {
    generateSessionRecap,
    regenerateSessionRecap,
    getSessionRecap,
  } = await import("../sessions/sessionRecaps.js");

  await generateSessionRecap(
    { guildId, sessionId },
    {
      generateStyleRecap: async ({ strategy }) =>
        buildStyleRecapResult({
          strategy,
          text: `v1-${strategy}`,
          sourceTranscriptHash: "hash-v1",
        }),
    }
  );

  const regenerated = await regenerateSessionRecap(
    { guildId, sessionId, reason: "manual_qc" },
    {
      generateStyleRecap: async ({ strategy }) =>
        buildStyleRecapResult({
          strategy,
          text: `v2-${strategy}`,
          createdAtMs: Date.now() + 1,
          sourceTranscriptHash: "hash-v2",
        }),
    }
  );

  expect(regenerated.views.balanced).toBe("v2-balanced");
  const loaded = getSessionRecap(guildId, sessionId);
  expect(loaded?.views.concise).toBe("v2-concise");
  expect(loaded?.views.balanced).toBe("v2-balanced");
  expect(loaded?.views.detailed).toBe("v2-detailed");
  expect(loaded?.metaJson).toContain("manual_qc");
});

test("repeated generateSessionRecap preserves createdAt and overwrites stored views predictably", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-recaps-repeat-generate-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-recaps-repeat";
  const sessionId = "session-recaps-repeat";
  await seedSessionAndLedger(guildId, sessionId);
  await markSpeakerAttributionReady(guildId, sessionId);

  const {
    generateSessionRecap,
    getSessionRecap,
  } = await import("../sessions/sessionRecaps.js");

  const first = await generateSessionRecap(
    { guildId, sessionId },
    {
      generateStyleRecap: async ({ strategy }) =>
        buildStyleRecapResult({
          strategy,
          text: `first-${strategy}`,
          sourceTranscriptHash: "hash-first",
        }),
    }
  );

  const second = await generateSessionRecap(
    { guildId, sessionId },
    {
      generateStyleRecap: async ({ strategy }) =>
        buildStyleRecapResult({
          strategy,
          text: `second-${strategy}`,
          createdAtMs: Date.now() + 10,
          sourceTranscriptHash: "hash-second",
        }),
    }
  );

  expect(second.createdAtMs).toBe(first.createdAtMs);
  expect(second.updatedAtMs).toBeGreaterThanOrEqual(first.updatedAtMs);
  expect(second.views.concise).toBe("second-concise");
  expect(second.views.balanced).toBe("second-balanced");
  expect(second.views.detailed).toBe("second-detailed");

  const loaded = getSessionRecap(guildId, sessionId);
  expect(loaded?.createdAtMs).toBe(first.createdAtMs);
  expect(loaded?.views.concise).toBe("second-concise");
  expect(loaded?.views.balanced).toBe("second-balanced");
  expect(loaded?.views.detailed).toBe("second-detailed");
});

test("generateSessionRecap maps missing transcript and invalid output to typed recap-domain errors", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-recaps-errors-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-recaps-errors";
  const sessionId = "session-recaps-errors";
  await seedSessionAndLedger(guildId, sessionId);
  await markSpeakerAttributionReady(guildId, sessionId);

  const {
    generateSessionRecap,
    RecapDomainError,
    isRecapDomainError,
  } = await import("../sessions/sessionRecaps.js");

  await expect(
    generateSessionRecap(
      { guildId, sessionId },
      {
        generateStyleRecap: async () => {
          throw new Error(`No transcript lines found for session ${sessionId}`);
        },
      }
    )
  ).rejects.toMatchObject({
    code: "RECAP_TRANSCRIPT_UNAVAILABLE",
  });

  await expect(
    generateSessionRecap(
      { guildId, sessionId },
      {
        generateStyleRecap: async ({ strategy }) => ({
          ...buildStyleRecapResult({
            strategy,
            text: strategy === "balanced" ? "   " : `${strategy}-ok`,
            sourceTranscriptHash: "hash-invalid",
          }),
        }),
      }
    )
  ).rejects.toMatchObject({
    code: "RECAP_INVALID_OUTPUT",
  });

  const error = new RecapDomainError("RECAP_GENERATION_FAILED", "boom");
  expect(isRecapDomainError(error)).toBe(true);
  expect(isRecapDomainError(new Error("plain"))).toBe(false);
});

test("generateSessionRecap returns explicit attribution-required domain error when speaker classification is incomplete", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-recaps-attribution-gate-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-recaps-attribution-gate";
  const sessionId = "session-recaps-attribution-gate";
  await seedSessionAndLedger(guildId, sessionId);

  const { setGuildDmUserId } = await import("../campaign/guildConfig.js");
  const { generateSessionRecap } = await import("../sessions/sessionRecaps.js");
  setGuildDmUserId(guildId, "user-2");

  await expect(
    generateSessionRecap(
      { guildId, sessionId },
      {
        generateStyleRecap: async ({ strategy }) =>
          buildStyleRecapResult({
            strategy,
            text: `${strategy}-ok`,
            sourceTranscriptHash: "hash-attribution",
          }),
      }
    )
  ).rejects.toMatchObject({
    code: "RECAP_SPEAKER_ATTRIBUTION_REQUIRED",
  });
});

test("generateSessionRecap blocks when stored PC attribution no longer resolves in registry", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-session-recaps-stale-pc-gate-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const guildId = "guild-recaps-stale-pc-gate";
  const sessionId = "session-recaps-stale-pc-gate";
  await seedSessionAndLedger(guildId, sessionId);
  const { resolveCampaignSlug, setGuildDmUserId } = await import("../campaign/guildConfig.js");
  const campaignSlug = resolveCampaignSlug({ guildId });
  seedPcRegistry(guildId, campaignSlug, "user-1");

  const { setSessionSpeakerClassifications } = await import("../sessions/sessionSpeakerAttribution.js");
  const { generateSessionRecap } = await import("../sessions/sessionRecaps.js");

  setGuildDmUserId(guildId, "user-2");
  setSessionSpeakerClassifications({
    guildId,
    campaignSlug,
    sessionId,
    entries: [{ discordUserId: "user-1", classificationType: "pc", pcEntityId: "pc_test_user" }],
  });

  const registryDir = getRegistryDirForScope({ guildId, campaignSlug });
  fs.writeFileSync(path.join(registryDir, "pcs.yml"), "version: 1\ncharacters: []\n", "utf8");

  await expect(
    generateSessionRecap(
      { guildId, sessionId, campaignSlug },
      {
        generateStyleRecap: async ({ strategy }) =>
          buildStyleRecapResult({
            strategy,
            text: `${strategy}-ok`,
            sourceTranscriptHash: "hash-stale-pc",
          }),
      }
    )
  ).rejects.toMatchObject({
    code: "RECAP_SPEAKER_ATTRIBUTION_REQUIRED",
  });
});
