import { cfg } from "../config/env.js";
import type { LlmChatRequest } from "./providerTypes.js";

type AnthropicErrorPayload = {
  type?: string;
  message?: string;
  error?: {
    type?: string;
    message?: string;
  };
};

type AnthropicRequestError = Error & {
  status?: number;
  provider?: "anthropic";
  providerCode?: string;
  bodySnippet?: string;
  model?: string;
};

function withJsonDirective(systemPrompt: string, responseFormat?: "text" | "json_object"): string {
  if (responseFormat !== "json_object") {
    return systemPrompt;
  }

  return `${systemPrompt}\n\nReturn only a valid JSON object. Do not include markdown fences or explanatory text.`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

function normalizeBodySnippet(raw: string): string | undefined {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, 240);
}

async function buildAnthropicRequestError(response: Response, request: LlmChatRequest): Promise<AnthropicRequestError> {
  const rawBody = await response.text();
  const bodySnippet = normalizeBodySnippet(rawBody);

  let parsed: AnthropicErrorPayload | null = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) as AnthropicErrorPayload : null;
  } catch {
    parsed = null;
  }

  const providerCode = parsed?.error?.type ?? parsed?.type;
  const providerMessage = parsed?.error?.message ?? parsed?.message ?? bodySnippet ?? response.statusText;
  const prefix = [String(response.status), providerCode].filter(Boolean).join(" ");
  const message = `Anthropic request failed: ${prefix}: ${providerMessage} (model=${request.model})`;

  return Object.assign(new Error(message), {
    status: response.status,
    provider: "anthropic" as const,
    providerCode,
    bodySnippet,
    model: request.model,
  });
}

export async function chatWithAnthropic(request: LlmChatRequest): Promise<string> {
  const apiKey = cfg.anthropic.apiKey;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      system: withJsonDirective(request.systemPrompt, request.responseFormat),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: request.userMessage,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw await buildAnthropicRequestError(response, request);
  }

  const body = await response.json() as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = body.content
    ?.filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Anthropic returned an empty response body.");
  }

  return text;
}