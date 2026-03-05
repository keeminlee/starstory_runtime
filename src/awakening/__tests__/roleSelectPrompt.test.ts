import { describe, expect, test } from "vitest";
import {
  buildRoleSelectPromptCustomId,
  parseRoleSelectPromptCustomId,
} from "../prompts/roleSelectPrompt.js";

describe("roleSelectPrompt", () => {
  test("custom id round-trips scene/key/nonce", () => {
    const customId = buildRoleSelectPromptCustomId({
      sceneId: "dm_role",
      key: "dm_role_id",
      nonce: "nonce-123",
    });

    const parsed = parseRoleSelectPromptCustomId(customId);
    expect(parsed).toEqual({
      sceneId: "dm_role",
      key: "dm_role_id",
      nonce: "nonce-123",
    });
  });
});
