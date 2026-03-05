import { afterEach, describe, expect, test, vi } from "vitest";

const createTranscription = vi.fn(async () => ({ text: "hello world" }));

vi.mock("../llm/client.js", () => ({
  getOpenAIClient: vi.fn(() => ({
    audio: {
      transcriptions: {
        create: createTranscription,
      },
    },
  })),
}));

vi.mock("openai/uploads", () => ({
  toFile: vi.fn(async () => ({ name: "utterance.wav" })),
}));

vi.mock("../config/env.js", () => ({
  cfg: {
    stt: {
      model: "whisper-1",
      language: "en",
      prompt: "Jamison, Minx",
    },
    logging: {
      level: "error",
      scopes: [],
      format: "pretty",
      debugLatch: false,
    },
    voice: {
      debug: false,
    },
  },
}));

describe("openai stt prompt forwarding", () => {
  afterEach(async () => {
    createTranscription.mockClear();
    const { clearGuildSttPromptCache } = await import("../voice/stt/promptState.js");
    clearGuildSttPromptCache();
  });

  test("uses guild override prompt when present", async () => {
    const { setGuildSttPrompt } = await import("../voice/stt/promptState.js");
    const { OpenAiSttProvider } = await import("../voice/stt/openai.js");

    setGuildSttPrompt("guild-1", "Jamison, Minx, Louis");
    const provider = new OpenAiSttProvider();

    await provider.transcribePcm(Buffer.alloc(8), 48_000, { guildId: "guild-1" });

    const calls = createTranscription.mock.calls as any[];
    const request = calls[0]?.[0] as { prompt?: string } | undefined;
    expect(request?.prompt).toBe("Jamison, Minx, Louis");
  });

  test("falls back to env prompt when no guild override", async () => {
    const { OpenAiSttProvider } = await import("../voice/stt/openai.js");
    const provider = new OpenAiSttProvider();

    await provider.transcribePcm(Buffer.alloc(8), 48_000, { guildId: "guild-x" });

    const calls = createTranscription.mock.calls as any[];
    const request = calls[0]?.[0] as { prompt?: string } | undefined;
    expect(request?.prompt).toBe("Jamison, Minx");
  });
});
