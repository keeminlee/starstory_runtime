import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

type MockChatCall = {
  guild_id?: string;
  campaign_slug?: string;
  session_id?: string;
  model?: string;
  executedProvider: string;
};

const mockChatCalls: MockChatCall[] = [];

vi.mock("../llm/client.js", async () => {
  return {
    chat: vi.fn(async (opts: {
      guild_id?: string;
      campaign_slug?: string;
      session_id?: string;
      model?: string;
    }) => {
      const { resolveRuntimeLlmProvider } = await import("../config/providerSelection.js");
      mockChatCalls.push({
        guild_id: opts.guild_id,
        campaign_slug: opts.campaign_slug,
        session_id: opts.session_id,
        model: opts.model,
        executedProvider: resolveRuntimeLlmProvider(opts.guild_id),
      });
      return "mocked-chat-output";
    }),
  };
});

const tempDirs: string[] = [];

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
  vi.stubEnv("GOOGLE_API_KEY", "test-google-key");
  vi.stubEnv("LLM_PROVIDER", "openai");
  vi.stubEnv("OPENAI_MODEL", "gpt-4o-mini");
  vi.stubEnv("ANTHROPIC_MODEL", "claude-haiku-4-5");
  vi.stubEnv("GOOGLE_MODEL", "gemini-2.0-flash");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  mockChatCalls.length = 0;
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

async function seedSessionFixture(guildId: string, sessionId: string): Promise<string> {
  const { getDbForCampaign } = await import("../db.js");
  const { resolveCampaignSlug } = await import("../campaign/guildConfig.js");
  const campaignSlug = resolveCampaignSlug({ guildId });
  const db = getDbForCampaign(campaignSlug);

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

  return campaignSlug;
}

async function seedSecondaryOnlySessionFixture(guildId: string, sessionId: string): Promise<string> {
  const { getDbForCampaign } = await import("../db.js");
  const { resolveCampaignSlug } = await import("../campaign/guildConfig.js");
  const campaignSlug = resolveCampaignSlug({ guildId });
  const db = getDbForCampaign(campaignSlug);

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
    "Secondary Only Arc",
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
    `${sessionId}-ledger-secondary`,
    guildId,
    "channel-1",
    `${sessionId}-msg-secondary`,
    "user-1",
    "Tester",
    Date.now() - 9_000,
    "We only have text for this session",
    "We only have text for this session",
    sessionId,
    "human",
    "text",
    "secondary"
  );

  return campaignSlug;
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
  const campaignSlug = await seedSessionFixture(guildId, sessionId);

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

  const basePathsByLabel = resolveMegameecapBasePaths(guildId, campaignSlug, sessionId, "Arc Test");
  expect(fs.existsSync(basePathsByLabel.basePath)).toBe(true);
  expect(fs.existsSync(basePathsByLabel.metaPath)).toBe(true);

  const finalPathsByLabel = resolveMegameecapFinalPaths(
    guildId,
    campaignSlug,
    sessionId,
    "balanced",
    "Arc Test"
  );
  expect(fs.existsSync(finalPathsByLabel.recapPath)).toBe(true);
  expect(fs.existsSync(finalPathsByLabel.metaPath)).toBe(true);
});

test("generateSessionRecap falls back to non-primary transcript rows when needed", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-recap-secondary-fallback-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const { generateSessionRecap } = await import("../sessions/recapEngine.js");

  const guildId = "guild-recap-secondary-fallback";
  const sessionId = "session-recap-secondary-fallback";
  await seedSecondaryOnlySessionFixture(guildId, sessionId);

  const result = await generateSessionRecap(
    {
      guildId,
      sessionId,
      strategy: "balanced",
    },
    {
      callLlm: async () => "Segment summary output",
    }
  );

  expect(result.text.length).toBeGreaterThan(0);
  expect(result.sourceTranscriptHash).toHaveLength(64);
  expect(result.sourceRange?.lineCount).toBe(1);
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

test("concurrent same-key recap requests share one in-flight generation", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-recap-inflight-dedupe-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const { generateSessionRecap } = await import("../sessions/recapEngine.js");
  const guildId = "guild-recap-inflight";
  const sessionId = "session-recap-inflight";
  await seedSessionFixture(guildId, sessionId);

  const llmCall = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "llm-output";
  });

  const [first, second] = await Promise.all([
    generateSessionRecap({ guildId, sessionId, strategy: "balanced" }, { callLlm: llmCall }),
    generateSessionRecap({ guildId, sessionId, strategy: "balanced" }, { callLlm: llmCall }),
  ]);

  // A single recap generation should perform one base pass and one final pass.
  expect(llmCall).toHaveBeenCalledTimes(2);
  expect(second.sourceTranscriptHash).toBe(first.sourceTranscriptHash);
  expect(second.finalVersion).toBe(first.finalVersion);
});

test("base hash mismatch triggers base regeneration", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-recap-hash-miss-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const { getDbForCampaign } = await import("../db.js");
  const { generateSessionRecap } = await import("../sessions/recapEngine.js");
  const { resolveCampaignSlug } = await import("../campaign/guildConfig.js");

  const guildId = "guild-recap-mismatch";
  const sessionId = "session-recap-mismatch";
  const campaignSlug = await seedSessionFixture(guildId, sessionId);

  const llmCall = vi.fn(async () => "llm-output");

  await generateSessionRecap(
    { guildId, sessionId, strategy: "balanced" },
    { callLlm: llmCall }
  );
  const callsAfterFirst = llmCall.mock.calls.length;

  const db = getDbForCampaign(resolveCampaignSlug({ guildId }) || campaignSlug);
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
  const { resolveCampaignSlug } = await import("../campaign/guildConfig.js");

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

  const db = getDbForCampaign(resolveCampaignSlug({ guildId }));
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

test("recap path preserves anthropic guild provider context even when env default is openai", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-recap-anthropic-context-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const { setGuildLlmProvider } = await import("../campaign/guildConfig.js");
  const { getSessionArtifact } = await import("../sessions/sessions.js");
  const { resolveDefaultLlmModel, resolveRuntimeLlmProvider } = await import("../config/providerSelection.js");
  const { generateSessionRecap } = await import("../sessions/recapEngine.js");

  const guildId = "guild-recap-anthropic-context";
  const sessionId = "session-recap-anthropic-context";
  const campaignSlug = await seedSessionFixture(guildId, sessionId);
  setGuildLlmProvider(guildId, "anthropic");

  const resolvedProvider = resolveRuntimeLlmProvider(guildId);
  const resolvedModel = resolveDefaultLlmModel(resolvedProvider);

  await generateSessionRecap({ guildId, sessionId, strategy: "balanced" });

  expect(resolvedProvider).toBe("anthropic");
  expect(resolvedModel).toBe("claude-haiku-4-5");
  expect(mockChatCalls.length).toBeGreaterThanOrEqual(2);
  for (const call of mockChatCalls) {
    expect(call.guild_id).toBe(guildId);
    expect(call.campaign_slug).toBe(campaignSlug);
    expect(call.session_id).toBe(sessionId);
    expect(call.executedProvider).toBe("anthropic");
    expect(call.model).toBe(resolvedModel);
  }
  const recapArtifact = getSessionArtifact(guildId, sessionId, "recap_final", undefined, campaignSlug);
  const recapMeta = recapArtifact?.meta_json ? JSON.parse(recapArtifact.meta_json) as Record<string, unknown> : null;
  expect(recapMeta?.llm_provider).toBe("anthropic");
  expect(recapMeta?.llm_model).toBe("claude-haiku-4-5");
  expect(mockChatCalls.some((call) => call.executedProvider === "openai")).toBe(false);
});

test("recap path preserves google guild provider context", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-recap-google-context-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const { setGuildLlmProvider } = await import("../campaign/guildConfig.js");
  const { resolveDefaultLlmModel, resolveRuntimeLlmProvider } = await import("../config/providerSelection.js");
  const { generateSessionRecap } = await import("../sessions/recapEngine.js");

  const guildId = "guild-recap-google-context";
  const sessionId = "session-recap-google-context";
  const campaignSlug = await seedSessionFixture(guildId, sessionId);
  setGuildLlmProvider(guildId, "google");

  const resolvedProvider = resolveRuntimeLlmProvider(guildId);
  const resolvedModel = resolveDefaultLlmModel(resolvedProvider);

  await generateSessionRecap({ guildId, sessionId, strategy: "balanced" });

  expect(resolvedProvider).toBe("google");
  expect(resolvedModel).toBe("gemini-2.0-flash");
  expect(mockChatCalls.length).toBeGreaterThanOrEqual(2);
  for (const call of mockChatCalls) {
    expect(call.guild_id).toBe(guildId);
    expect(call.campaign_slug).toBe(campaignSlug);
    expect(call.session_id).toBe(sessionId);
    expect(call.executedProvider).toBe("google");
    expect(call.model).toBe(resolvedModel);
  }
});

test("assertModelMatchesProvider fails loudly on obvious recap provider-model drift", async () => {
  const { assertModelMatchesProvider } = await import("../sessions/recapEngine.js");

  expect(() =>
    assertModelMatchesProvider("anthropic", "gpt-4o-mini", {
      guild_id: "guild-a",
      campaign_slug: "campaign-a",
      session_id: "session-a",
    })
  ).toThrow(/resolved provider 'anthropic'.*model 'gpt-4o-mini'.*looks like 'openai'.*guild_id=guild-a.*campaign_slug=campaign-a.*session_id=session-a/i);

  expect(() =>
    assertModelMatchesProvider("google", "claude-haiku-4-5", {
      guild_id: "guild-b",
      campaign_slug: "campaign-b",
      session_id: "session-b",
    })
  ).toThrow(/resolved provider 'google'.*looks like 'anthropic'/i);

  expect(() =>
    assertModelMatchesProvider("openai", "gemini-2.0-flash", {
      guild_id: "guild-c",
      campaign_slug: "campaign-c",
      session_id: "session-c",
    })
  ).toThrow(/resolved provider 'openai'.*looks like 'google'/i);
});
