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
    guildId: "guild-awaken-1",
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

describe("AwakenEngine", () => {
  test("dialogue-only script runs through scenes and completes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-awaken-engine-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { AwakenEngine } = await import("../AwakenEngine.js");
    const { getDbForCampaign } = await import("../../db.js");
    const { initState, loadState } = await import("../../ledger/awakeningStateRepo.js");

    const script: AwakenScript = {
      id: "meepo_awaken",
      version: 1,
      start_scene: "cold_open",
      scenes: {
        cold_open: {
          say: [{ text: "beat-1" }, { text: "beat-2" }],
          next: "scene2",
        },
        scene2: {
          say: "scene-two",
        },
      },
    };

    const db = getDbForCampaign("default");
    initState("guild-awaken-1", script.id, script.version, script.start_scene, { db });

    const interaction = buildInteraction();
    const result = await AwakenEngine.runWake(interaction, { db, script });

    expect(result.status).toBe("completed");
    expect(result.emittedBeatCount).toBe(3);
    expect(interaction.followUp).toHaveBeenCalledTimes(3);
    const followUpCalls = interaction.followUp.mock.calls as unknown as Array<[{ content: string }]>;
    expect(followUpCalls.at(0)?.[0]?.content).toBe("beat-1");
    expect(followUpCalls.at(1)?.[0]?.content).toBe("beat-2");
    expect(followUpCalls.at(2)?.[0]?.content).toBe("scene-two");

    const state = loadState("guild-awaken-1", script.id, { db });
    expect(state?.completed).toBe(true);
    expect(state?.current_scene).toBe("scene2");
    expect(state?.beat_index).toBe(0);
    db.close();
  });

  test("resume mid-scene starts from persisted beat index", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-awaken-engine-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { AwakenEngine } = await import("../AwakenEngine.js");
    const { getDbForCampaign } = await import("../../db.js");
    const { initState, loadState, setBeatIndex } = await import("../../ledger/awakeningStateRepo.js");

    const script: AwakenScript = {
      id: "meepo_awaken",
      version: 1,
      start_scene: "cold_open",
      scenes: {
        cold_open: {
          say: [{ text: "beat-1" }, { text: "beat-2" }],
          next: "done",
        },
        done: {
          say: "",
        },
      },
    };

    const db = getDbForCampaign("default");
    initState("guild-awaken-1", script.id, script.version, script.start_scene, { db });
    setBeatIndex("guild-awaken-1", script.id, 1, { db });

    const interaction = buildInteraction();
    const result = await AwakenEngine.runWake(interaction, { db, script });

    expect(result.status).toBe("completed");
    expect(interaction.followUp).toHaveBeenCalledTimes(2);
    const followUpCalls = interaction.followUp.mock.calls as unknown as Array<[{ content: string }]>;
    expect(followUpCalls.at(0)?.[0]?.content).toBe("beat-2");

    const state = loadState("guild-awaken-1", script.id, { db });
    expect(state?.beat_index).toBe(0);
    expect(state?.current_scene).toBe("done");
    db.close();
  });

  test("scene with prompt emits dialogue then blocks on continue before prompt", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-awaken-engine-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { AwakenEngine } = await import("../AwakenEngine.js");
    const { getDbForCampaign } = await import("../../db.js");
    const { initState, loadState, saveProgress } = await import("../../ledger/awakeningStateRepo.js");

    const script: AwakenScript = {
      id: "meepo_awaken",
      version: 1,
      start_scene: "cold_open",
      scenes: {
        cold_open: {
          say: [{ text: "beat-1" }],
          prompt: { type: "text_input", key: "dm_display_name", kind: "modal_text" },
        },
      },
    };

    const db = getDbForCampaign("default");
    initState("guild-awaken-1", script.id, script.version, script.start_scene, { db });

    const interaction = buildInteraction();
    const result = await AwakenEngine.runWake(interaction, { db, script });

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.reason).toBe("prompt");
      expect(result.sceneId).toBe("cold_open");
      expect(result.emittedBeatCount).toBe(1);
    }

    const state = loadState("guild-awaken-1", script.id, { db });
    expect(state?.current_scene).toBe("cold_open");
    expect(state?.beat_index).toBe(1);
    expect(state?.progress_json.await_input).toEqual({ key: "__continue__", kind: "continue" });
    expect(state?.completed).toBe(false);

    const continueNonce = String(state?.progress_json.pending_prompt_nonce ?? "");
    saveProgress("guild-awaken-1", script.id, {
      __continue__: "cold_open",
      await_input: null,
      pending_prompt_kind: null,
      pending_prompt_key: null,
      pending_prompt_scene_id: null,
      pending_prompt_nonce: null,
      pending_prompt_created_at_ms: null,
    }, { db });

    const second = await AwakenEngine.runWake(interaction, { db, script });
    expect(second.status).toBe("blocked");
    const stateAfterContinue = loadState("guild-awaken-1", script.id, { db });
    expect(stateAfterContinue?.progress_json.__continue__).toBeNull();
    expect(stateAfterContinue?.progress_json.await_input).toEqual({ key: "dm_display_name", kind: "modal_text" });
    expect(String(stateAfterContinue?.progress_json.pending_prompt_nonce ?? "")).not.toBe(continueNonce);
    db.close();
  });

  test("unsupported next shape blocks with reason next", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-awaken-engine-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { AwakenEngine } = await import("../AwakenEngine.js");
    const { getDbForCampaign } = await import("../../db.js");
    const { initState } = await import("../../ledger/awakeningStateRepo.js");

    const script: AwakenScript = {
      id: "meepo_awaken",
      version: 1,
      start_scene: "cold_open",
      scenes: {
        cold_open: {
          say: "beat-1",
          next: { type: "when", predicate: "x" },
        },
      },
    };

    const db = getDbForCampaign("default");
    initState("guild-awaken-1", script.id, script.version, script.start_scene, { db });

    const interaction = buildInteraction();
    const result = await AwakenEngine.runWake(interaction, { db, script });

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.reason).toBe("next");
    }
    db.close();
  });

  test("beat budget guard blocks long scenes without losing progress", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-awaken-engine-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { AwakenEngine } = await import("../AwakenEngine.js");
    const { getDbForCampaign } = await import("../../db.js");
    const { initState, loadState } = await import("../../ledger/awakeningStateRepo.js");

    const script: AwakenScript = {
      id: "meepo_awaken",
      version: 1,
      start_scene: "cold_open",
      scenes: {
        cold_open: {
          say: Array.from({ length: 10 }, (_, index) => ({ text: `beat-${index + 1}` })),
        },
      },
    };

    const db = getDbForCampaign("default");
    initState("guild-awaken-1", script.id, script.version, script.start_scene, { db });

    const interaction = buildInteraction();
    const result = await AwakenEngine.runWake(interaction, { db, script, maxBeatsPerRun: 3 });

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.reason).toBe("budget");
      expect(result.emittedBeatCount).toBe(3);
    }

    const state = loadState("guild-awaken-1", script.id, { db });
    expect(state?.beat_index).toBe(3);
    expect(state?.completed).toBe(false);
    db.close();
  });

  test("respects per-beat delay order via injected sleepFn", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-awaken-engine-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { AwakenEngine } = await import("../AwakenEngine.js");
    const { getDbForCampaign } = await import("../../db.js");
    const { initState } = await import("../../ledger/awakeningStateRepo.js");

    const script: AwakenScript = {
      id: "meepo_awaken",
      version: 1,
      start_scene: "cold_open",
      scenes: {
        cold_open: {
          say: [
            { text: "beat-1", delay_ms: 1000 },
            { text: "beat-2", delay_ms: 2000 },
          ],
        },
      },
    };

    const db = getDbForCampaign("default");
    initState("guild-awaken-1", script.id, script.version, script.start_scene, { db });

    const sleepCalls: number[] = [];
    const interaction = buildInteraction();
    const result = await AwakenEngine.runWake(interaction, {
      db,
      script,
      sleepFn: async (ms: number) => {
        sleepCalls.push(ms);
      },
    });

    expect(result.status).toBe("completed");
    expect(sleepCalls).toEqual([1000, 2000]);
    db.close();
  });

  test("clamps oversized delay to MAX_DELAY_MS", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-awaken-engine-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { AwakenEngine, MAX_DELAY_MS } = await import("../AwakenEngine.js");
    const { getDbForCampaign } = await import("../../db.js");
    const { initState } = await import("../../ledger/awakeningStateRepo.js");

    const script: AwakenScript = {
      id: "meepo_awaken",
      version: 1,
      start_scene: "cold_open",
      scenes: {
        cold_open: {
          say: [{ text: "beat-1", delay_ms: 999999 }],
        },
      },
    };

    const db = getDbForCampaign("default");
    initState("guild-awaken-1", script.id, script.version, script.start_scene, { db });

    const sleepCalls: number[] = [];
    const interaction = buildInteraction();
    const result = await AwakenEngine.runWake(interaction, {
      db,
      script,
      sleepFn: async (ms: number) => {
        sleepCalls.push(ms);
      },
    });

    expect(result.status).toBe("completed");
    expect(sleepCalls).toEqual([MAX_DELAY_MS]);
    db.close();
  });

  test("total delay budget blocks before oversleep and preserves resumable state", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-awaken-engine-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { AwakenEngine } = await import("../AwakenEngine.js");
    const { getDbForCampaign } = await import("../../db.js");
    const { initState, loadState } = await import("../../ledger/awakeningStateRepo.js");

    const script: AwakenScript = {
      id: "meepo_awaken",
      version: 1,
      start_scene: "cold_open",
      scenes: {
        cold_open: {
          say: [
            { text: "beat-1", delay_ms: 1000 },
            { text: "beat-2", delay_ms: 1200 },
            { text: "beat-3", delay_ms: 1200 },
          ],
        },
      },
    };

    const db = getDbForCampaign("default");
    initState("guild-awaken-1", script.id, script.version, script.start_scene, { db });

    const sleepCalls: number[] = [];
    const interaction = buildInteraction();
    const result = await AwakenEngine.runWake(interaction, {
      db,
      script,
      maxTotalDelayMsPerRun: 2000,
      sleepFn: async (ms: number) => {
        sleepCalls.push(ms);
      },
    });

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.reason).toBe("budget_delay");
      expect(result.emittedBeatCount).toBe(2);
    }

    expect(sleepCalls).toEqual([1000]);

    const state = loadState("guild-awaken-1", script.id, { db });
    expect(state?.current_scene).toBe("cold_open");
    expect(state?.beat_index).toBe(2);
    expect(state?.completed).toBe(false);
    db.close();
  });
});
