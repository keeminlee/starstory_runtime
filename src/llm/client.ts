import OpenAI from "openai";
import { cfg } from "../config/env.js";
import { getRequiredCredentialEnvKeyForLlmProvider, isLlmProviderConfigured, resolveDefaultLlmModel, resolveRuntimeLlmProvider } from "../config/providerSelection.js";
import { log } from "../utils/logger.js";
import { MeepoError } from "../errors/meepoError.js";
import { chatWithAnthropic } from "./anthropic.js";
import { chatWithGoogle } from "./google.js";

const llmLog = log.withScope("llm", {
  requireGuildContext: true,
  callsite: "llm/client.ts",
});

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = cfg.openai.apiKey;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured in .env");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export async function chat(opts: {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
  trace_id?: string;
  interaction_id?: string;
  guild_id?: string;
  campaign_slug?: string;
  session_id?: string;
}): Promise<string> {
  const provider = resolveRuntimeLlmProvider(opts.guild_id);
  const model = opts.model ?? resolveDefaultLlmModel(provider);
  const temperature = opts.temperature ?? cfg.llm.temperature;
  const maxTokens = opts.maxTokens ?? cfg.llm.maxTokens;
  const context = {
    trace_id: opts.trace_id,
    interaction_id: opts.interaction_id,
    guild_id: opts.guild_id,
    campaign_slug: opts.campaign_slug,
    session_id: opts.session_id,
  };

  try {
    if (!isLlmProviderConfigured(provider)) {
      const envKey = getRequiredCredentialEnvKeyForLlmProvider(provider);
      throw new MeepoError("ERR_INVALID_STATE", {
        message: `LLM provider '${provider}' requires ${envKey} to be configured.`,
        trace_id: opts.trace_id,
        interaction_id: opts.interaction_id,
        metadata: {
          provider,
          env_key: envKey,
        },
      });
    }

    llmLog.info("LLM request started", {
      provider,
      model,
      max_tokens: maxTokens,
      response_format: opts.responseFormat ?? "text",
    }, context);

    let content: string | undefined;

    switch (provider) {
      case "openai": {
        const client = getOpenAIClient();
        const response = await client.chat.completions.create({
          model,
          temperature,
          max_tokens: maxTokens,
          ...(opts.responseFormat === "json_object"
            ? { response_format: { type: "json_object" as const } }
            : {}),
          messages: [
            { role: "system", content: opts.systemPrompt },
            { role: "user", content: opts.userMessage },
          ],
        });
        content = response.choices[0]?.message?.content?.trim();
        break;
      }

      case "anthropic":
        content = await chatWithAnthropic({
          systemPrompt: opts.systemPrompt,
          userMessage: opts.userMessage,
          model,
          temperature,
          maxTokens,
          responseFormat: opts.responseFormat,
        });
        break;

      case "google":
        content = await chatWithGoogle({
          systemPrompt: opts.systemPrompt,
          userMessage: opts.userMessage,
          model,
          temperature,
          maxTokens,
          responseFormat: opts.responseFormat,
        });
        break;
    }

    if (!content) {
      throw new MeepoError("ERR_INVALID_STATE", {
        message: `Empty response from ${provider}`,
        trace_id: opts.trace_id,
        interaction_id: opts.interaction_id,
      });
    }

    llmLog.debug("LLM request completed", {
      provider,
      response_chars: content.length,
    }, context);

    return content;
  } catch (err: any) {
    if (err instanceof MeepoError) {
      llmLog.error("LLM request failed", {
        error_code: err.code,
        error: err.message,
      }, context);
      throw err;
    }

    const status = typeof err?.status === "number" ? err.status : undefined;
    const code = String(err?.code ?? "").toLowerCase();
    const msg = String(err?.message ?? "").toLowerCase();
    const providerCode = typeof err?.providerCode === "string" ? err.providerCode : undefined;
    const isTimeout = code.includes("timeout") || msg.includes("timeout") || msg.includes("timed out");
    const mappedCode: "ERR_LLM_RATE_LIMIT" | "ERR_LLM_TIMEOUT" | "ERR_UNKNOWN" = status === 429
      ? "ERR_LLM_RATE_LIMIT"
      : isTimeout
        ? "ERR_LLM_TIMEOUT"
        : "ERR_UNKNOWN";

    const wrapped = new MeepoError(mappedCode, {
      message: `LLM request failed: ${err?.message ?? "unknown error"}`,
      cause: err,
      trace_id: opts.trace_id,
      interaction_id: opts.interaction_id,
      metadata: {
        provider,
        provider_code: providerCode,
        status,
        model,
      },
    });

    llmLog.error("LLM request failed", {
      error_code: wrapped.code,
      error: wrapped.message,
      provider,
      status,
    }, context);
    throw wrapped;
  }
}
