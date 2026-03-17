/**
 * STT Provider Interface (Phase 2 Task 3)
 * 
 * Pluggable interface for speech-to-text transcription.
 * Keeps the receiver decoupled from specific STT vendors.
 */

import { NoopSttProvider } from "./noop.js";
import { DebugSttProvider } from "./debug.js";
import { cfg } from "../../config/env.js";
import { resolveRuntimeSttProvider } from "../../config/providerSelection.js";

export type SttTranscriptionMeta = {
  noSpeechProb?: number;
  avgLogprob?: number;
};

export type SttTranscriptionResult = {
  text: string;
  confidence?: number;
  meta?: SttTranscriptionMeta;
};

export interface SttProvider {
  /**
   * Transcribe PCM audio to text.
   * @param pcm Raw PCM audio buffer
   * @param sampleRate Sample rate (typically 48000 for Discord)
   * @returns Transcription result with optional confidence score
   */
  transcribePcm(
    pcm: Buffer,
    sampleRate: number,
    opts?: { guildId?: string }
  ): Promise<SttTranscriptionResult>;
}

/**
 * Get provider info for user-facing messages.
 */
export function getSttProviderInfo(): { name: string; description: string } {
  const provider = resolveRuntimeSttProvider();
  
  switch (provider) {
    case "noop":
      return { name: "noop", description: "discards transcripts (silent mode)" };
    case "debug":
      return { name: "debug", description: "emits test transcripts for development" };
    case "whisper": {
      const model = cfg.stt.model;
      return {
        name: "whisper",
        description: `real transcripts via OpenAI Whisper (${model})`,
      };
    }
    case "deepgram":
      return { name: "deepgram", description: `real transcripts via Deepgram (${cfg.stt.deepgramModel})` };
    default:
      return { name: provider, description: "unknown provider (using noop)" };
  }
}

/**
 * Get the configured STT provider based on environment.
 * STT_PROVIDER env var: "whisper" | "deepgram" | "noop" | "debug"
 *
 * Providers are lazy-loaded and cached (single instance per bot lifetime).
 */

const providerPromises = new Map<string, Promise<SttProvider>>();

export async function getSttProvider(guildId?: string): Promise<SttProvider> {
  const provider = resolveRuntimeSttProvider(guildId);
  const cached = providerPromises.get(provider);
  if (cached) return cached;

  const providerPromise = (async () => {
    switch (provider) {
      case "noop":
        return new NoopSttProvider();

      case "debug":
        return new DebugSttProvider();

      case "whisper": {
        // Lazy-load OpenAI provider to avoid importing SDK if not used
        const { OpenAiSttProvider } = await import("./openai.js");
        return new OpenAiSttProvider();
      }

      case "deepgram":
        const { DeepgramSttProvider } = await import("./deepgram.js");
        return new DeepgramSttProvider();

      default:
        console.warn(
          `[STT] Unknown provider "${provider}", falling back to noop`
        );
        return new NoopSttProvider();
    }
  })();

  providerPromises.set(provider, providerPromise);
  return providerPromise;
}
