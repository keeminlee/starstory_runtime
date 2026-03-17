import { getGuildLlmProvider, getGuildSttProvider } from "../campaign/guildConfig.js";
import { cfg } from "./env.js";
import { hasEnv } from "./rawEnv.js";
import type { LlmProvider, SttProvider } from "./types.js";

export function resolveRuntimeSttProvider(guildId?: string | null): SttProvider {
  if (!guildId) {
    return cfg.stt.provider;
  }

  return getGuildSttProvider(guildId) ?? cfg.stt.provider;
}

export function resolveRuntimeLlmProvider(guildId?: string | null): LlmProvider {
  if (!guildId) {
    return cfg.llm.provider;
  }

  return getGuildLlmProvider(guildId) ?? cfg.llm.provider;
}

export function getRequiredCredentialEnvKeyForSttProvider(provider: SttProvider): string | null {
  switch (provider) {
    case "whisper":
      return "OPENAI_API_KEY";
    case "deepgram":
      return "DEEPGRAM_API_KEY";
    case "noop":
    case "debug":
      return null;
    default:
      return null;
  }
}

export function isSttProviderConfigured(provider: SttProvider): boolean {
  switch (provider) {
    case "whisper":
      return hasEnv("OPENAI_API_KEY");
    case "deepgram":
      return hasEnv("DEEPGRAM_API_KEY");
    case "noop":
    case "debug":
      return true;
    default:
      return false;
  }
}

export function getRequiredCredentialEnvKeyForLlmProvider(provider: LlmProvider): string {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "google":
      return "GOOGLE_API_KEY";
    default:
      return "UNKNOWN_LLM_PROVIDER";
  }
}

export function isLlmProviderConfigured(provider: LlmProvider): boolean {
  switch (provider) {
    case "openai":
      return hasEnv("OPENAI_API_KEY");
    case "anthropic":
      return hasEnv("ANTHROPIC_API_KEY");
    case "google":
      return hasEnv("GOOGLE_API_KEY");
    default:
      return false;
  }
}

export function resolveDefaultLlmModel(provider: LlmProvider): string {
  switch (provider) {
    case "openai":
      return cfg.llm.openaiModel;
    case "anthropic":
      return cfg.llm.anthropicModel;
    case "google":
      return cfg.llm.googleModel;
    default:
      return cfg.llm.openaiModel;
  }
}