import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MeepoError } from "../errors/meepoError.js";

let activeReplyMode: "voice" | "text" = "voice";
let synthesizeImpl: (text: string) => Promise<Buffer> = async () => Buffer.from("mp3");
let loadRegistryImpl: () => any = () => ({ byDiscordUserId: new Map(), characters: [] });

const channelSend = vi.fn(async (_content: string) => ({ id: "msg-1", createdTimestamp: Date.now() }));
const channelFetch = vi.fn(async (_channelId: string) => ({
  isTextBased: () => true,
  send: channelSend,
}));

vi.mock("../config/env.js", () => ({
  cfg: {
    logging: { level: "debug" },
    voice: { replyCooldownMs: 0 },
    features: { memoryEnabled: true },
  },
}));

vi.mock("../meepo/state.js", () => ({
  getActiveMeepo: vi.fn(() => ({ reply_mode: activeReplyMode, persona_seed: "seed" })),
}));

vi.mock("../meepo/personaState.js", () => ({
  getEffectivePersonaId: vi.fn(() => "meta_meepo"),
  getMindspace: vi.fn(() => "ambient"),
}));

vi.mock("../voice/state.js", () => ({
  getVoiceState: vi.fn(() => ({
    guild: {
      client: {
        user: { id: "bot-1", username: "Meepo" },
        channels: { fetch: channelFetch },
      },
    },
  })),
}));

const speakInGuildMock = vi.fn();
vi.mock("../voice/speaker.js", () => ({
  isMeepoSpeaking: vi.fn(() => false),
  speakInGuild: speakInGuildMock,
}));

vi.mock("../voice/tts/provider.js", () => ({
  getTtsProvider: vi.fn(async () => ({
    synthesize: vi.fn(async (text: string) => synthesizeImpl(text)),
  })),
}));

vi.mock("../personas/index.js", () => ({
  getPersona: vi.fn(() => ({ id: "meta_meepo", displayName: "Meta Meepo" })),
}));

vi.mock("../llm/prompts.js", () => ({
  buildUserMessage: vi.fn(() => "user-message"),
}));

vi.mock("../llm/buildMeepoPromptBundle.js", () => ({
  buildMeepoPromptBundle: vi.fn(() => ({
    system: "system-prompt",
    retrieval: {
      core_memories: [],
      relevant_memories: [],
    },
  })),
}));

vi.mock("../llm/client.js", () => ({
  chat: vi.fn(async () => "voice reply text"),
}));

vi.mock("../recall/loadMeepoContextSnapshot.js", () => ({
  loadMeepoContextSnapshot: vi.fn(async () => ({
    context: "recent context",
    hasVoice: true,
  })),
}));

vi.mock("../ledger/speakerSanitizer.js", () => ({
  getSanitizedSpeakerName: vi.fn((_guildId: string, _speakerId: string, speakerName: string) => speakerName),
}));

vi.mock("../ledger/system.js", () => ({
  logSystemEvent: vi.fn(),
}));

vi.mock("../voice/audioFx.js", () => ({
  applyPostTtsFx: vi.fn(async (buffer: Buffer) => buffer),
}));

vi.mock("../sessions/sessions.js", () => ({
  getActiveSession: vi.fn(() => null),
}));

vi.mock("../ledger/meepoConvo.js", () => ({
  logConvoTurn: vi.fn(),
}));

vi.mock("../recall/buildConvoTailContext.js", () => ({
  buildConvoTailContext: vi.fn(() => ({ tailBlock: "" })),
}));

vi.mock("../ledger/ledger.js", () => ({
  appendLedgerEntry: vi.fn(),
}));

vi.mock("../registry/loadRegistry.js", () => ({
  loadRegistryForScope: vi.fn(() => loadRegistryImpl()),
}));

vi.mock("../registry/extractRegistryMatches.js", () => ({
  extractRegistryMatches: vi.fn(() => []),
}));

vi.mock("../ledger/eventSearch.js", () => ({
  searchEventsByTitleScoped: vi.fn(() => []),
}));

vi.mock("../ledger/gptcapProvider.js", () => ({
  loadGptcap: vi.fn(() => null),
}));

vi.mock("../recall/findRelevantBeats.js", () => ({
  findRelevantBeats: vi.fn(() => []),
}));

vi.mock("../recall/buildMemoryContext.js", () => ({
  buildMemoryContext: vi.fn(() => ""),
}));

vi.mock("../recall/recallSafety.js", () => ({
  RECALL_SAFETY: {
    shape: {
      maxRegistryMatches: 5,
      maxEventsPerMatch: 25,
      maxUniqueEvents: 60,
      maxSessionsWithEvents: 4,
      maxBeatsPerSession: 4,
      maxTotalBeats: 12,
      maxTranscriptLines: 80,
    },
  },
  boundedItems: vi.fn((items: any[]) => items),
  checkAndRecordRecallThrottle: vi.fn(() => ({ throttled: false, reason: null, retryAfterMs: 0 })),
}));

vi.mock("../ledger/transcripts.js", () => ({
  getTranscriptLines: vi.fn(() => []),
  buildTranscript: vi.fn(() => []),
}));

const runMock = vi.fn((_: any, fn: () => Promise<boolean>) => fn());
vi.mock("../observability/context.js", () => ({
  getOrCreateTraceId: vi.fn(() => "trace-voice"),
  getObservabilityContext: vi.fn(() => ({ trace_id: "trace-voice", interaction_id: "interaction-voice" })),
  runWithObservabilityContext: runMock,
}));

vi.mock("../db.js", () => ({
  getDbForCampaign: vi.fn(() => ({
    prepare: vi.fn((sql: string) => {
      if (sql.includes("SELECT id")) {
        return { get: vi.fn(() => undefined) };
      }
      return { run: vi.fn() };
    }),
  })),
}));

vi.mock("../campaign/guildConfig.js", () => ({
  resolveCampaignSlug: vi.fn(() => "default"),
}));

vi.mock("../latch/latch.js", () => ({
  incrementLatchTurn: vi.fn(),
}));

vi.mock("../ledger/meepoInteractions.js", () => ({
  classifyTrigger: vi.fn(() => "wake_phrase"),
  recordMeepoInteraction: vi.fn(),
  trimToSnippet: vi.fn((text: string) => text.slice(0, 50)),
}));

beforeEach(() => {
  activeReplyMode = "voice";
  synthesizeImpl = async () => Buffer.from("mp3");
  loadRegistryImpl = () => ({ byDiscordUserId: new Map(), characters: [] });
  channelSend.mockClear();
  channelFetch.mockClear();
  speakInGuildMock.mockClear();
  runMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("voice reply degradation contract", () => {
  test("falls back to taxonomy-coded text reply when TTS fails", async () => {
    synthesizeImpl = async () => {
      throw new MeepoError("ERR_TTS_FAILED", {
        message: "tts failed",
      });
    };

    const { respondToVoiceUtterance } = await import("../voice/voiceReply.js");

    const ok = await respondToVoiceUtterance({
      guildId: "guild-voice-fail",
      channelId: "text-1",
      speakerId: "user-1",
      speakerName: "Tester",
      utterance: "Meepo?",
    });

    expect(ok).toBe(true);
    expect(channelSend).toHaveBeenCalledTimes(1);
    const payload = channelSend.mock.calls[0]?.[0] as string;
    expect(payload).toContain("(ERR_TTS_FAILED)");
    expect(payload).toContain("couldn't speak");
    expect(speakInGuildMock).not.toHaveBeenCalled();
  });

  test("optional memory enrichment failure degrades quietly and still replies", async () => {
    activeReplyMode = "text";
    loadRegistryImpl = () => {
      throw new Error("No bronze transcript data found for session");
    };

    const { respondToVoiceUtterance } = await import("../voice/voiceReply.js");

    const ok = await respondToVoiceUtterance({
      guildId: "guild-voice-enrichment",
      channelId: "text-2",
      speakerId: "user-2",
      speakerName: "Tester2",
      utterance: "what happened last game?",
      replyViaTextOnly: true,
    });

    expect(ok).toBe(true);
    expect(channelSend).toHaveBeenCalledTimes(1);
    const payload = channelSend.mock.calls[0]?.[0] as string;
    expect(payload).toBe("voice reply text");
    expect(payload).not.toContain("ERR_");
  });
});
