export type LlmChatRequest = {
  systemPrompt: string;
  userMessage: string;
  model: string;
  temperature: number;
  maxTokens: number;
  responseFormat?: "text" | "json_object";
};