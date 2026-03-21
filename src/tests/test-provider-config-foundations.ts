import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

process.env.DISCORD_TOKEN ??= "test-token";

const tempDirs: string[] = [];
const originalCwd = process.cwd();

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("MEEPO_ENV_POLICY_MODE", "");
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("MIGRATIONS_SILENT", "1");
  vi.stubEnv("DEFAULT_CAMPAIGN_SLUG", "default");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  process.chdir(originalCwd);

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore transient Windows file locks during cleanup.
    }
  }
});

describe("provider config foundations", () => {
  test("parses provider defaults and optional secret env keys", async () => {
    vi.stubEnv("MEEPO_ENV_POLICY_MODE", "");
    vi.stubEnv("DISCORD_TOKEN", "discord-test-token");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_MODEL", "gpt-4o");
    vi.stubEnv("DEEPGRAM_API_KEY", "deepgram-test-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-test-key");
    vi.stubEnv("GOOGLE_API_KEY", "google-test-key");

    const { loadConfig } = await import("../config/env.js");
    const cfg = loadConfig();

    expect(cfg.envPolicy.mode).toBe("test-hermetic");
    expect(cfg.stt.provider).toBe("whisper");
    expect(cfg.llm.provider).toBe("openai");
    expect(cfg.llm.openaiModel).toBe("gpt-4o");
    expect(cfg.openai.apiKey).toBeUndefined();
    expect(cfg.deepgram.apiKey).toBe("deepgram-test-key");
    expect(cfg.anthropic.apiKey).toBe("anthropic-test-key");
    expect(cfg.google.apiKey).toBe("google-test-key");
  });

  test("redacts all provider secret keys", async () => {
    const { redactConfigSnapshot } = await import("../config/redact.js");
    const redacted = redactConfigSnapshot({
      OPENAI_API_KEY: "openai-secret",
      DEEPGRAM_API_KEY: "deepgram-secret",
      ANTHROPIC_API_KEY: "anthropic-secret",
      GOOGLE_API_KEY: "google-secret",
      nested: {
        DISCORD_TOKEN: "discord-secret",
      },
    }) as Record<string, unknown>;

    expect(redacted.OPENAI_API_KEY).toBe("<redacted>");
    expect(redacted.DEEPGRAM_API_KEY).toBe("<redacted>");
    expect(redacted.ANTHROPIC_API_KEY).toBe("<redacted>");
    expect(redacted.GOOGLE_API_KEY).toBe("<redacted>");
    expect((redacted.nested as Record<string, unknown>).DISCORD_TOKEN).toBe("<redacted>");
  });

  test("bootstraps guild provider columns and round-trips guild provider settings", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-provider-foundation-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { getControlDb } = await import("../db.js");
    const {
      getGuildConfig,
      getGuildLlmProvider,
      getGuildSttProvider,
      setGuildLlmProvider,
      setGuildSttProvider,
    } = await import("../campaign/guildConfig.js");

    const db = getControlDb();
    const columns = db.prepare("PRAGMA table_info(guild_config)").all() as Array<{ name: string }>;

    expect(columns.some((column) => column.name === "stt_provider")).toBe(true);
    expect(columns.some((column) => column.name === "llm_provider")).toBe(true);

    setGuildSttProvider("guild-1", "deepgram");
    setGuildLlmProvider("guild-1", "google");

    expect(getGuildSttProvider("guild-1")).toBe("deepgram");
    expect(getGuildLlmProvider("guild-1")).toBe("google");

    const row = getGuildConfig("guild-1");
    expect(row?.stt_provider).toBe("deepgram");
    expect(row?.llm_provider).toBe("google");
  });

  test("resolves runtime provider overrides from guild config", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-provider-resolution-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    vi.stubEnv("STT_PROVIDER", "debug");
    vi.stubEnv("LLM_PROVIDER", "openai");

    const { setGuildLlmProvider, setGuildSttProvider } = await import("../campaign/guildConfig.js");
    const { resolveRuntimeLlmProvider, resolveRuntimeSttProvider } = await import("../config/providerSelection.js");

    setGuildSttProvider("guild-2", "whisper");
    setGuildLlmProvider("guild-2", "google");

    expect(resolveRuntimeSttProvider()).toBe("debug");
    expect(resolveRuntimeSttProvider("guild-2")).toBe("whisper");
    expect(resolveRuntimeLlmProvider("guild-2")).toBe("google");
  });

  test("web consumer does not require discord token", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-provider-web-config-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    vi.stubEnv("DISCORD_TOKEN", "");
    process.chdir(path.join(originalCwd, "apps", "web"));

    const { loadConfig } = await import("../config/env.js");
    const cfg = loadConfig();

    expect(cfg.envPolicy.consumer).toBe("web");
    expect(cfg.discord.token).toBe("");
  });
});