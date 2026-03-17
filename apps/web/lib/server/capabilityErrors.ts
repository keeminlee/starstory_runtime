import {
  getRequiredCredentialEnvKeyForLlmProvider,
  isLlmProviderConfigured,
  resolveRuntimeLlmProvider,
} from "../../../../src/config/providerSelection.js";

export type CapabilityCode =
  | "openai_unconfigured"
  | "anthropic_unconfigured"
  | "google_unconfigured"
  | "llm_unconfigured"
  | "discord_refresh_unconfigured";

function getCapabilityCodeForProvider(provider: ReturnType<typeof resolveRuntimeLlmProvider>): CapabilityCode {
  switch (provider) {
    case "openai":
      return "openai_unconfigured";
    case "anthropic":
      return "anthropic_unconfigured";
    case "google":
      return "google_unconfigured";
    default:
      return "llm_unconfigured";
  }
}

export class CapabilityUnavailableError extends Error {
  readonly code: CapabilityCode;
  readonly status = 503;

  constructor(code: CapabilityCode, message: string) {
    super(message);
    this.name = "CapabilityUnavailableError";
    this.code = code;
  }
}

export function assertLlmConfigured(guildId?: string | null): void {
  const provider = resolveRuntimeLlmProvider(guildId);
  if (!isLlmProviderConfigured(provider)) {
    const envKey = getRequiredCredentialEnvKeyForLlmProvider(provider);
    throw new CapabilityUnavailableError(
      getCapabilityCodeForProvider(provider),
      `Recap regeneration is unavailable because ${envKey} is not configured for the selected ${provider} provider.`
    );
  }
}
