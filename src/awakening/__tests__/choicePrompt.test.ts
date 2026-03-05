import { describe, expect, test } from "vitest";
import {
  buildChoicePromptCustomId,
  getChoicePromptOptions,
  parseChoicePromptCustomId,
  resolveChoicePromptValue,
} from "../prompts/choicePrompt.js";

describe("choicePrompt", () => {
  test("custom id round-trips scene/key/nonce/index", () => {
    const customId = buildChoicePromptCustomId({
      sceneId: "talk_pref",
      key: "voice_mode",
      nonce: "abc123",
      optionIndex: 1,
    });

    const parsed = parseChoicePromptCustomId(customId);
    expect(parsed).toEqual({
      sceneId: "talk_pref",
      key: "voice_mode",
      nonce: "abc123",
      optionIndex: 1,
    });
  });

  test("resolves selected choice value by index", () => {
    const prompt = {
      type: "choice",
      key: "voice_mode",
      label: "How should Meepo reply?",
      options: [
        { value: "voice", label: "Voice replies" },
        { value: "text", label: "Text replies" },
      ],
    } as const;

    expect(getChoicePromptOptions(prompt).map((option) => option.value)).toEqual(["voice", "text"]);
    expect(resolveChoicePromptValue(prompt, 0)).toBe("voice");
    expect(resolveChoicePromptValue(prompt, 1)).toBe("text");
    expect(resolveChoicePromptValue(prompt, 2)).toBeNull();
  });
});
