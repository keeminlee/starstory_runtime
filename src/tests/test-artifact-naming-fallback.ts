import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const tempDirs: string[] = [];
let warnSpy: ReturnType<typeof vi.fn>;

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
}

beforeEach(() => {
  warnSpy = vi.fn();
  vi.doMock("../utils/logger.js", () => ({
    log: {
      withScope: vi.fn(() => ({
        warn: warnSpy,
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        trace: vi.fn(),
      })),
    },
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup on Windows where handles can linger briefly.
    }
  }
});

test("buildSessionArtifactStem is unique and sanitizes scope tokens", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-artifact-stem-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const { buildSessionArtifactStem } = await import("../dataPaths.js");

  const a = buildSessionArtifactStem({
    guildId: "Guild One",
    campaignSlug: "Season 1",
    sessionId: "Session-42",
  });
  const b = buildSessionArtifactStem({
    guildId: "Guild Two",
    campaignSlug: "Season 1",
    sessionId: "Session-42",
  });
  const c = buildSessionArtifactStem({
    guildId: "Guild One",
    campaignSlug: "Season 2",
    sessionId: "Session-42",
  });
  const d = buildSessionArtifactStem({
    guildId: "Guild One",
    campaignSlug: "Season 1",
    sessionId: "Session-99",
  });
  const missingCampaign = buildSessionArtifactStem({
    guildId: "Guild One",
    campaignSlug: "   ",
    sessionId: "Session-42",
  });

  expect(a).toBe("g_guild-one__c_season-1__s_session-42");
  expect(b).toBe("g_guild-two__c_season-1__s_session-42");
  expect(c).toBe("g_guild-one__c_season-2__s_session-42");
  expect(d).toBe("g_guild-one__c_season-1__s_session-99");
  expect(missingCampaign).toBe("g_guild-one__c_none__s_session-42");
  expect(new Set([a, b, c, d]).size).toBe(4);
});

test("getBaseStatus prefers canonical artifact over legacy name when both exist", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-artifact-prefer-canonical-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const { buildLegacySessionArtifactStem } = await import("../dataPaths.js");
  const { resolveMegameecapBasePaths, getBaseStatus } = await import("../sessions/megameecapArtifactLocator.js");

  const guildId = "guild-alpha";
  const campaignSlug = "default";
  const sessionId = "session-123";
  const sessionLabel = "Arc Prime";

  const canonical = resolveMegameecapBasePaths(guildId, campaignSlug, sessionId, sessionLabel);
  fs.mkdirSync(canonical.outputDir, { recursive: true });
  fs.writeFileSync(canonical.basePath, "# canonical", "utf8");
  fs.writeFileSync(
    canonical.metaPath,
    JSON.stringify({ source_hash: "canonical-hash", base_version: "v1", created_at_ms: 1 }),
    "utf8"
  );

  const legacyStem = buildLegacySessionArtifactStem(sessionId, sessionLabel);
  const legacyBasePath = path.join(canonical.outputDir, `${legacyStem}-megameecap-base.md`);
  const legacyMetaPath = path.join(canonical.outputDir, `${legacyStem}-megameecap-base.meta.json`);
  fs.writeFileSync(legacyBasePath, "# legacy", "utf8");
  fs.writeFileSync(
    legacyMetaPath,
    JSON.stringify({ source_hash: "legacy-hash", base_version: "v0", created_at_ms: 2 }),
    "utf8"
  );

  const status = getBaseStatus(guildId, campaignSlug, sessionId, sessionLabel);

  expect(status.exists).toBe(true);
  expect(status.paths.basePath).toBe(canonical.basePath);
  expect(status.sourceHash).toBe("canonical-hash");
  expect(warnSpy).not.toHaveBeenCalled();
});

test("getBaseStatus falls back to legacy path and emits one telemetry event", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-artifact-legacy-fallback-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const { buildLegacySessionArtifactStem } = await import("../dataPaths.js");
  const { resolveMegameecapBasePaths, getBaseStatus } = await import("../sessions/megameecapArtifactLocator.js");

  const guildId = "guild-alpha";
  const campaignSlug = "default";
  const sessionId = "session-legacy";
  const sessionLabel = "Arc Prime";

  const canonical = resolveMegameecapBasePaths(guildId, campaignSlug, sessionId, sessionLabel);
  fs.mkdirSync(canonical.outputDir, { recursive: true });

  const legacyStem = buildLegacySessionArtifactStem(sessionId, sessionLabel);
  const legacyBasePath = path.join(canonical.outputDir, `${legacyStem}-megameecap-base.md`);
  const legacyMetaPath = path.join(canonical.outputDir, `${legacyStem}-megameecap-base.meta.json`);
  fs.writeFileSync(legacyBasePath, "# legacy", "utf8");
  fs.writeFileSync(
    legacyMetaPath,
    JSON.stringify({ source_hash: "legacy-hash", base_version: "v0", created_at_ms: 2 }),
    "utf8"
  );

  const first = getBaseStatus(guildId, campaignSlug, sessionId, sessionLabel);
  const second = getBaseStatus(guildId, campaignSlug, sessionId, sessionLabel);

  expect(first.exists).toBe(true);
  expect(first.paths.basePath).toBe(legacyBasePath);
  expect(first.sourceHash).toBe("legacy-hash");
  expect(second.paths.basePath).toBe(legacyBasePath);
  expect(warnSpy).toHaveBeenCalledTimes(1);

  const [message, payload] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
  expect(message).toBe("legacy_artifact_path_used");
  expect(payload.event_type).toBe("legacy_artifact_path_used");
  expect(payload.guild_id).toBe(guildId);
  expect(payload.campaign_slug).toBe(campaignSlug);
  expect(payload.session_id).toBe(sessionId);
  expect(payload.artifact_type).toBe("megameecap_base");
  expect(payload.requested_path).toBe(canonical.basePath);
  expect(payload.resolved_legacy_path).toBe(legacyBasePath);
});

test("getFinalStatus prefers canonical artifact over legacy name when both exist", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-final-prefer-canonical-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const strategy = "balanced" as const;
  const { buildLegacySessionArtifactStem } = await import("../dataPaths.js");
  const { resolveMegameecapFinalPaths, getFinalStatus } = await import("../sessions/megameecapArtifactLocator.js");

  const guildId = "guild-alpha";
  const campaignSlug = "default";
  const sessionId = "session-final-123";
  const sessionLabel = "Arc Prime";

  const canonical = resolveMegameecapFinalPaths(guildId, campaignSlug, sessionId, strategy, sessionLabel);
  fs.mkdirSync(canonical.outputDir, { recursive: true });
  fs.writeFileSync(canonical.recapPath, "# canonical final", "utf8");
  fs.writeFileSync(
    canonical.metaPath,
    JSON.stringify({ source_hash: "canonical-final-hash", final_version: "v1", created_at_ms: 10 }),
    "utf8"
  );

  const legacyStem = buildLegacySessionArtifactStem(sessionId, sessionLabel);
  const legacyFinalPath = path.join(canonical.outputDir, `${legacyStem}-recap-final-${strategy}.md`);
  const legacyMetaPath = path.join(canonical.outputDir, `${legacyStem}-recap-final-${strategy}.meta.json`);
  fs.writeFileSync(legacyFinalPath, "# legacy final", "utf8");
  fs.writeFileSync(
    legacyMetaPath,
    JSON.stringify({ source_hash: "legacy-final-hash", final_version: "v0", created_at_ms: 2 }),
    "utf8"
  );

  const status = getFinalStatus(guildId, campaignSlug, sessionId, strategy, sessionLabel);

  expect(status.exists).toBe(true);
  expect(status.paths?.recapPath).toBe(canonical.recapPath);
  expect(status.sourceHash).toBe("canonical-final-hash");
  expect(warnSpy).not.toHaveBeenCalled();
});

test("getFinalStatus falls back to legacy path and emits one telemetry event", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-final-legacy-fallback-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);
  vi.resetModules();

  const strategy = "balanced" as const;
  const { buildLegacySessionArtifactStem } = await import("../dataPaths.js");
  const { resolveMegameecapFinalPaths, getFinalStatus } = await import("../sessions/megameecapArtifactLocator.js");

  const guildId = "guild-alpha";
  const campaignSlug = "default";
  const sessionId = "session-final-legacy";
  const sessionLabel = "Arc Prime";

  const canonical = resolveMegameecapFinalPaths(guildId, campaignSlug, sessionId, strategy, sessionLabel);
  fs.mkdirSync(canonical.outputDir, { recursive: true });

  const legacyStem = buildLegacySessionArtifactStem(sessionId, sessionLabel);
  const legacyFinalPath = path.join(canonical.outputDir, `${legacyStem}-recap-final-${strategy}.md`);
  const legacyMetaPath = path.join(canonical.outputDir, `${legacyStem}-recap-final-${strategy}.meta.json`);
  fs.writeFileSync(legacyFinalPath, "# legacy final", "utf8");
  fs.writeFileSync(
    legacyMetaPath,
    JSON.stringify({ source_hash: "legacy-final-hash", final_version: "v0", created_at_ms: 2 }),
    "utf8"
  );

  const first = getFinalStatus(guildId, campaignSlug, sessionId, strategy, sessionLabel);
  const second = getFinalStatus(guildId, campaignSlug, sessionId, strategy, sessionLabel);

  expect(first.exists).toBe(true);
  expect(first.paths?.recapPath).toBe(legacyFinalPath);
  expect(first.sourceHash).toBe("legacy-final-hash");
  expect(second.paths?.recapPath).toBe(legacyFinalPath);
  expect(warnSpy).toHaveBeenCalledTimes(1);

  const [message, payload] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
  expect(message).toBe("legacy_artifact_path_used");
  expect(payload.event_type).toBe("legacy_artifact_path_used");
  expect(payload.guild_id).toBe(guildId);
  expect(payload.campaign_slug).toBe(campaignSlug);
  expect(payload.session_id).toBe(sessionId);
  expect(payload.artifact_type).toBe("recap_final");
  expect(payload.requested_path).toBe(canonical.recapPath);
  expect(payload.resolved_legacy_path).toBe(legacyFinalPath);
});
