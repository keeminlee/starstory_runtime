import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

process.env.DISCORD_TOKEN ??= "test-token";

const tempDirs: string[] = [];

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("MIGRATIONS_SILENT", "1");
  vi.stubEnv("DEFAULT_CAMPAIGN_SLUG", "default");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();

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

describe("provider adapters", () => {
  test("OpenAI adapter uses max_completion_tokens for chat requests", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-provider-adapter-openai-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    vi.stubEnv("DISCORD_TOKEN", "discord-test-token");
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    vi.stubEnv("OPENAI_MODEL", "gpt-5-mini");

    const createMock = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "openai reply",
          },
        },
      ],
    });

    vi.doMock("openai", () => ({
      default: class OpenAI {
        chat = {
          completions: {
            create: createMock,
          },
        };
      },
    }));

    const { chat } = await import("../llm/client.js");
    const reply = await chat({
      systemPrompt: "You are concise.",
      userMessage: "Hello",
      maxTokens: 64,
    });

    expect(reply).toBe("openai reply");
    expect(createMock).toHaveBeenCalledTimes(1);
    const [payload] = createMock.mock.calls[0] as [Record<string, unknown>];
    expect(payload.model).toBe("gpt-5-mini");
    expect(payload.max_completion_tokens).toBe(64);
    expect(payload).not.toHaveProperty("max_tokens");
  });

  test("deepgram STT adapter posts wav audio and parses transcript", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-provider-adapter-stt-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    vi.stubEnv("DISCORD_TOKEN", "discord-test-token");
    vi.stubEnv("DEEPGRAM_API_KEY", "deepgram-test-key");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "hello from deepgram",
                  confidence: 0.91,
                },
              ],
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { DeepgramSttProvider } = await import("../voice/stt/deepgram.js");
    const provider = new DeepgramSttProvider();
    const pcm = Buffer.alloc(4800, 0);

    const result = await provider.transcribePcm(pcm, 48000);

    expect(result.text).toBe("hello from deepgram");
    expect(result.confidence).toBe(0.91);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.deepgram.com/v1/listen");
    expect(url).toContain("model=nova-3");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Token deepgram-test-key");
  });

  test("LLM routes to anthropic adapter for guild override", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-provider-adapter-anthropic-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    vi.stubEnv("DISCORD_TOKEN", "discord-test-token");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-test-key");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-haiku-4-5");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { type: "text", text: "anthropic reply" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { setGuildLlmProvider } = await import("../campaign/guildConfig.js");
    setGuildLlmProvider("guild-anthropic", "anthropic");

    const { chat } = await import("../llm/client.js");
    const reply = await chat({
      guild_id: "guild-anthropic",
      systemPrompt: "You are concise.",
      userMessage: "Hello",
      maxTokens: 64,
    });

    expect(reply).toBe("anthropic reply");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const payload = JSON.parse(String(init.body));
    expect(payload.model).toBe("claude-haiku-4-5");
    expect(payload.max_tokens).toBe(64);
    expect(payload.system).toBe("You are concise.");
    expect(payload.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Hello",
          },
        ],
      },
    ]);
  });

  test("Anthropic adapter surfaces provider status, code, message, and model on failure", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-provider-adapter-anthropic-error-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    vi.stubEnv("DISCORD_TOKEN", "discord-test-token");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-test-key");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-haiku-4-5");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => JSON.stringify({
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "model 'claude-haiku-4-5' not found",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { setGuildLlmProvider } = await import("../campaign/guildConfig.js");
    setGuildLlmProvider("guild-anthropic-error", "anthropic");

    const { chat } = await import("../llm/client.js");

    await expect(
      chat({
        guild_id: "guild-anthropic-error",
        systemPrompt: "You are concise.",
        userMessage: "Hello",
        maxTokens: 64,
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining("Anthropic request failed: 400 invalid_request_error: model 'claude-haiku-4-5' not found (model=claude-haiku-4-5)"),
      metadata: expect.objectContaining({
        provider: "anthropic",
        provider_code: "invalid_request_error",
        status: 400,
        model: "claude-haiku-4-5",
      }),
    });
  });

  test("LLM routes to google adapter with JSON response format support", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-provider-adapter-google-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    vi.stubEnv("DISCORD_TOKEN", "discord-test-token");
    vi.stubEnv("GOOGLE_API_KEY", "google-test-key");
    vi.stubEnv("GOOGLE_MODEL", "gemini-2.0-flash");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: '{"ok":true}' }],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { setGuildLlmProvider } = await import("../campaign/guildConfig.js");
    setGuildLlmProvider("guild-google", "google");

    const { chat } = await import("../llm/client.js");
    const reply = await chat({
      guild_id: "guild-google",
      systemPrompt: "Return JSON.",
      userMessage: "Status",
      responseFormat: "json_object",
      maxTokens: 64,
    });

    expect(reply).toBe('{"ok":true}');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent");
    const payload = JSON.parse(String(init.body));
    expect(payload.generationConfig.responseMimeType).toBe("application/json");
  });
});