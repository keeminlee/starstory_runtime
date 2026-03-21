export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";
export type LogFormat = "pretty" | "json";

export type GuildSttProvider = "whisper" | "deepgram";
export type SttProvider = GuildSttProvider | "noop" | "debug";
export type LlmProvider = "openai" | "anthropic" | "google";
export type TtsProvider = "openai" | "noop";
export type BargeInMode = "immediate" | "micro_confirm";
export type EnvPolicyMode = "development-dotenv" | "production-host" | "test-hermetic";
export type EnvPolicyConsumer = "runtime" | "web";

export type MeepoMode = "canon" | "ambient" | "lab" | "dormant";

export interface EnvPolicySecretDiagnostic {
  present: boolean;
  fingerprint?: string;
  suffix?: string;
}

export interface EnvPolicySnapshot {
  mode: EnvPolicyMode;
  consumer: EnvPolicyConsumer;
  detectedFiles: string[];
  loadedFiles: string[];
  ignoredFiles: string[];
  forbiddenFiles: string[];
  secretState: Record<string, EnvPolicySecretDiagnostic>;
}

export interface Config {
  mode: MeepoMode;
  envPolicy: EnvPolicySnapshot;

  discord: {
    token: string;
    dmRoleId?: string;
    clientId?: string;
    guildId?: string;
    botPrefix: string;
  };

  openai: {
    apiKey?: string;
  };

  deepgram: {
    apiKey?: string;
  };

  anthropic: {
    apiKey?: string;
  };

  google: {
    apiKey?: string;
  };

  db: {
    path: string;
    filename: string;
  };

  data: {
    root: string;
    campaignsDir: string;
  };

  session: {
    autoSleepMs: number; // 0 disables
    announcementChannelId?: string;
    meecapMode: string;
  };

  llm: {
    enabled: boolean;
    provider: LlmProvider;
    openaiModel: string;
    anthropicModel: string;
    googleModel: string;
    temperature: number;
    maxTokens: number;
    voiceContextMs: number;
  };

  overlay: {
    port: number;
    voiceChannelId?: string;
    homeVoiceChannelId?: string;
  };

  voice: {
    chunkSizeMs: number;
    silenceThresholdDb: number;
    endSilenceMs: number;
    replyCooldownMs: number;
    interruptActiveMs: number;
    hushDefault: boolean;
    bargeInMode: BargeInMode;
    microConfirmMs: number;
    microConfirmFrames: number;
    debug: boolean;
  };

  stt: {
    provider: SttProvider;
    saveAudio: boolean;
    model: string;
    deepgramModel: string;
    language: string;
    prompt?: string;
    minAudioMs: number;
    minActiveRatio: number;
    noSpeechProbMax: number;
  };

  tts: {
    provider: TtsProvider;
    enabled: boolean;
    chunkSizeChars: number;
    model: string;
    voice: string;
  };

  audioFx: {
    enabled: boolean;
    pitch: number;
    reverb: {
      enabled: boolean;
      wet: number;
      roomMs: number;
      damping: number;
      delayMs: number;
      decay: number;
    };
    ffmpegPath?: string;
  };

  features: {
    memoryEnabled: boolean;
    goldMemoryEnabled: boolean;
    contextMiniFirst: boolean;
    contextInlineActionsDev: boolean;
    contextWorkerEnabled: boolean;
  };

  meepoContextActions: {
    pollMs: number;
    maxActionsPerTick: number;
    maxTotalRuntimeMs: number;
    leaseTtlMs: number;
    maxAttempts: number;
    retryBaseMs: number;
  };

  meepoActionLogging: {
    enabled: boolean;
    includePromptBodies: boolean;
  };

  access: {
    devUserIds: string[];
    dmUserIds: string[];
  };

  logging: {
    level: LogLevel;
    scopes?: string[]; // empty/undefined => all
    format: LogFormat;
    debugLatch: boolean;
  };
}
