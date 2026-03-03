import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

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

async function seedSessionFixture(guildId: string, sessionId: string): Promise<void> {
  const { getDbForCampaign } = await import("../db.js");
  const db = getDbForCampaign("default");

  db.prepare(
    `
      INSERT INTO sessions (
        session_id, guild_id, kind, mode_at_start, label,
        created_at_ms, started_at_ms, ended_at_ms, ended_reason,
        started_by_id, started_by_name, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    sessionId,
    guildId,
    "canon",
    "canon",
    "Arc Test",
    Date.now() - 10_000,
    Date.now() - 10_000,
    Date.now() - 1_000,
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
    `${sessionId}-ledger-1`,
    guildId,
    "channel-1",
    `${sessionId}-msg-1`,
    "user-1",
    "Tester",
    Date.now() - 9_000,
    "We enter the dungeon",
    "We enter the dungeon",
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
    `${sessionId}-ledger-2`,
    guildId,
    "channel-1",
    `${sessionId}-msg-2`,
    "user-2",
    "DM",
    Date.now() - 8_000,
    "A hidden door appears",
    "A hidden door appears",
    sessionId,
    "human",
    "voice",
    "primary"
  );
}

test("generateSessionRecap returns non-empty text and stable metadata fields", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-recap-engine-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const { generateSessionRecap } = await import("../sessions/recapEngine.js");
  const {
    resolveMegameecapBasePaths,
    resolveMegameecapFinalPaths,
  } = await import("../sessions/megameecapArtifactLocator.js");

  const guildId = "guild-recap-test";
  const sessionId = "session-recap-1";
  await seedSessionFixture(guildId, sessionId);

  const result = await generateSessionRecap(
    {
      guildId,
      sessionId,
      strategy: "balanced",
    },
    {
      callLlm: async (_input) => "Segment summary output",
    }
  );

  expect(result.text.length).toBeGreaterThan(0);
  expect(result.strategy).toBe("balanced");
  expect(result.engine).toBe("megameecap");
  expect(result.baseVersion).toBe("megameecap-base-v1");
  expect(result.finalVersion).toBe("megameecap-final-v1");
  expect(result.sourceTranscriptHash).toHaveLength(64);
  expect(result.sourceRange?.lineCount).toBeGreaterThan(0);
  expect(result.cacheHit).toBe(false);

  const basePaths = resolveMegameecapBasePaths("default", sessionId);
  expect(fs.existsSync(basePaths.basePath)).toBe(true);
  expect(fs.existsSync(basePaths.metaPath)).toBe(true);

  const finalPaths = resolveMegameecapFinalPaths("default", sessionId, "balanced");
  expect(fs.existsSync(finalPaths.recapPath)).toBe(true);
  expect(fs.existsSync(finalPaths.metaPath)).toBe(true);
});

test("final style regeneration reuses base cache and avoids base rerun", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-recap-base-cache-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const { generateSessionRecap } = await import("../sessions/recapEngine.js");
  const guildId = "guild-recap-base-cache";
  const sessionId = "session-recap-base-cache";
  await seedSessionFixture(guildId, sessionId);

  const llmCall = vi.fn(async () => "llm-output");

  await generateSessionRecap(
    { guildId, sessionId, strategy: "detailed" },
    { callLlm: llmCall }
  );
  const callsAfterFirst = llmCall.mock.calls.length;
  expect(callsAfterFirst).toBeGreaterThanOrEqual(2);

  await generateSessionRecap(
    { guildId, sessionId, strategy: "balanced" },
    { callLlm: llmCall }
  );
  const callsAfterSecond = llmCall.mock.calls.length;

  expect(callsAfterSecond - callsAfterFirst).toBe(1);
});

test("base hash mismatch triggers base regeneration", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-recap-hash-miss-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const { getDbForCampaign } = await import("../db.js");
  const { generateSessionRecap } = await import("../sessions/recapEngine.js");

  const guildId = "guild-recap-mismatch";
  const sessionId = "session-recap-mismatch";
  await seedSessionFixture(guildId, sessionId);

  const llmCall = vi.fn(async () => "llm-output");

  await generateSessionRecap(
    { guildId, sessionId, strategy: "balanced" },
    { callLlm: llmCall }
  );
  const callsAfterFirst = llmCall.mock.calls.length;

  const db = getDbForCampaign("default");
  db.prepare(
    `
      INSERT INTO ledger_entries (
        id, guild_id, channel_id, message_id, author_id, author_name,
        timestamp_ms, content, content_norm, session_id, tags,
        source, narrative_weight
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    `${sessionId}-ledger-3`,
    guildId,
    "channel-1",
    `${sessionId}-msg-3`,
    "user-3",
    "Player",
    Date.now() - 1_000,
    "Late backfilled line",
    "Late backfilled line",
    sessionId,
    "human",
    "text",
    "primary"
  );

  await generateSessionRecap(
    { guildId, sessionId, strategy: "balanced" },
    { callLlm: llmCall }
  );

  const callsAfterSecond = llmCall.mock.calls.length;
  expect(callsAfterSecond - callsAfterFirst).toBeGreaterThanOrEqual(2);
});

test("final overwrite semantics keep one recap_final row (most recent style)", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-recap-single-final-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const { getSessionArtifact } = await import("../sessions/sessions.js");
  const { getDbForCampaign } = await import("../db.js");
  const { generateSessionRecap } = await import("../sessions/recapEngine.js");

  const guildId = "guild-recap-single-final";
  const sessionId = "session-recap-single-final";
  await seedSessionFixture(guildId, sessionId);

  await generateSessionRecap(
    { guildId, sessionId, strategy: "balanced" },
    { callLlm: async () => "balanced-output" }
  );

  await generateSessionRecap(
    { guildId, sessionId, strategy: "concise" },
    { callLlm: async () => "concise-output" }
  );

  const recapFinal = getSessionArtifact(guildId, sessionId, "recap_final");
  expect(recapFinal).toBeTruthy();
  expect(recapFinal?.strategy).toBe("concise");

  const db = getDbForCampaign("default");
  const countRow = db
    .prepare(
      `
        SELECT COUNT(*) AS c
        FROM session_artifacts
        WHERE session_id = ? AND artifact_type = 'recap_final'
      `
    )
    .get(sessionId) as { c: number };

  expect(countRow.c).toBe(1);
});
