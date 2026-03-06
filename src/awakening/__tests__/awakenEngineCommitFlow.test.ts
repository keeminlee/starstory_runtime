import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AwakenScript } from "../../scripts/awakening/_schema.js";

const tempDirs: string[] = [];

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
  vi.stubEnv("MIGRATIONS_SILENT", "1");
}

function buildInteraction() {
  return {
    guildId: "guild-flow-1",
    deferred: false,
    replied: false,
    deferReply: vi.fn(async () => undefined),
    editReply: vi.fn(async () => undefined),
    followUp: vi.fn(async () => undefined),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore transient Windows file lock cleanup failures in test teardown.
      }
    }
  }
});

describe("AwakenEngine commit flow", () => {
  test("prompt input persists, commit executes, and scene advances", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-awaken-commit-flow-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { getDbForCampaign } = await import("../../db.js");
    const { initState, loadState, saveProgress } = await import("../../ledger/awakeningStateRepo.js");
    const { acceptDmDisplayNameResponse } = await import("../wakeIdentity.js");
    const { AwakenEngine } = await import("../AwakenEngine.js");

    const script: AwakenScript = {
      id: "meepo_awaken",
      version: 1,
      start_scene: "ask_dm_name",
      scenes: {
        ask_dm_name: {
          say: "What should I call you, Dungeon Master?",
          prompt: { type: "text_input", key: "dm_display_name", kind: "modal_text" },
          commit: [
            {
              type: "write_memory",
              memory_key: "dm_display_name",
              scope: "guild",
              from: "dm_display_name",
            },
          ],
          next: "done",
        },
        done: {
          commit: [
            {
              type: "set_flag",
              key: "awakened",
              value: true,
            },
          ],
        },
      },
    };

    const db = getDbForCampaign("default");
    initState("guild-flow-1", script.id, script.version, script.start_scene, { db });

    const firstInteraction = buildInteraction();
    const first = await AwakenEngine.runWake(firstInteraction, { db, script });
    expect(first.status).toBe("blocked");
    if (first.status === "blocked") {
      expect(first.reason).toBe("prompt");
    }

    const blockedState = loadState("guild-flow-1", script.id, { db });
    expect(blockedState?.progress_json.await_input).toEqual({ key: "__continue__", kind: "continue" });

    saveProgress("guild-flow-1", script.id, {
      __continue__: "ask_dm_name",
      await_input: null,
      pending_prompt_kind: null,
      pending_prompt_key: null,
      pending_prompt_scene_id: null,
      pending_prompt_nonce: null,
      pending_prompt_created_at_ms: null,
    }, { db });

    const gateInteraction = buildInteraction();
    const gated = await AwakenEngine.runWake(gateInteraction, { db, script });
    expect(gated.status).toBe("blocked");

    const promptState = loadState("guild-flow-1", script.id, { db });
    expect(promptState?.progress_json.await_input).toEqual({ key: "dm_display_name", kind: "modal_text" });

    acceptDmDisplayNameResponse({
      db,
      guildId: "guild-flow-1",
      script,
      responseText: "ZZZ_TEST_DM_NAME",
    });

    const secondInteraction = buildInteraction();
    const second = await AwakenEngine.runWake(secondInteraction, { db, script });
    expect(second.status).toBe("blocked");
    if (second.status === "blocked") {
      expect(second.reason).toBe("commit");
    }

    const finalState = loadState("guild-flow-1", script.id, { db });
    expect(finalState?.progress_json.dm_display_name).toBe("ZZZ_TEST_DM_NAME");
    expect(finalState?.progress_json.await_input).toBeNull();
    expect(finalState?.progress_json.pending_prompt_kind).toBeNull();

    db.close();
  });
});
