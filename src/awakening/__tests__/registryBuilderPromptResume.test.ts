import { describe, expect, test, vi } from "vitest";
import { renderPendingAwakeningPrompt } from "../prompts/index.js";

describe("registry_builder resume", () => {
  test("re-renders user-select step when _rb_pending_character_name exists", async () => {
    const reply = vi.fn(async (_payload: unknown) => undefined);
    const interaction = {
      replied: false,
      deferred: false,
      guild: {
        members: {
          cache: new Map([
            ["u1", { id: "u1", displayName: "Player One", user: { username: "PlayerOne" } }],
          ]),
        },
      },
      reply,
      editReply: vi.fn(async (_payload: unknown) => undefined),
    } as any;

    const script = {
      id: "meepo_awaken",
      version: 2,
      start_scene: "player_registry",
      scenes: {
        player_registry: {
          prompt: {
            type: "registry_builder",
            key: "players",
            label: "Add each player and character",
          },
        },
      },
    } as any;

    const state = {
      guild_id: "guild-1",
      script_id: "meepo_awaken",
      script_version: 2,
      current_scene: "player_registry",
      beat_index: 0,
      completed: false,
      progress_json: {
        players: [],
        _rb_pending_character_name: "Arin",
      },
      updated_at_ms: Date.now(),
    };

    const rendered = await renderPendingAwakeningPrompt({
      interaction,
      script,
      state: state as any,
      pending: {
        kind: "registry_builder",
        key: "players",
        sceneId: "player_registry",
        nonce: "nonce-1",
      },
    });

    expect(rendered).toBe(true);
    expect(reply).toHaveBeenCalledTimes(1);
    const payload = reply.mock.calls[0]?.[0] as { content?: string };
    expect(payload.content).toContain("Assign character \"Arin\" to a player.");
  });
});
