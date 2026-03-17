import { cfg } from "../config/env.js";
import type { LlmChatRequest } from "./providerTypes.js";

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export async function chatWithGoogle(request: LlmChatRequest): Promise<string> {
  const apiKey = cfg.google.apiKey;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: request.systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: request.userMessage }],
        },
      ],
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        ...(request.responseFormat === "json_object"
          ? { responseMimeType: "application/json" }
          : {}),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Google request failed: ${await readErrorMessage(response)}`);
  }

  const body = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Google returned an empty response body.");
  }

  return text;
}