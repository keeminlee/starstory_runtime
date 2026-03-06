import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const tempDirs: string[] = [];

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
  vi.stubEnv("MIGRATIONS_SILENT", "1");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("awakeningStateRepo", () => {
  test("init creates state with start scene and default fields", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-awaken-state-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { getDbForCampaign } = await import("../../db.js");
    const {
      initState,
      loadState,
    } = await import("../awakeningStateRepo.js");

    const db = getDbForCampaign("default");
    const state = initState("guild-1", "meepo_awaken", 1, "cold_open", { db });

    expect(state.guild_id).toBe("guild-1");
    expect(state.script_id).toBe("meepo_awaken");
    expect(state.script_version).toBe(1);
    expect(state.current_scene).toBe("cold_open");
    expect(state.beat_index).toBe(0);
    expect(state.completed).toBe(false);
    expect(state.progress_json).toEqual({});

    const loaded = loadState("guild-1", "meepo_awaken", { db });
    expect(loaded).not.toBeNull();
    expect(loaded?.current_scene).toBe("cold_open");
    db.close();
  });

  test("init is idempotent and does not overwrite progress", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-awaken-state-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { getDbForCampaign } = await import("../../db.js");
    const {
      initState,
      saveProgress,
      loadState,
    } = await import("../awakeningStateRepo.js");

    const db = getDbForCampaign("default");
    initState("guild-2", "meepo_awaken", 1, "cold_open", { db });
    saveProgress("guild-2", "meepo_awaken", { dm_user_id: "u-123" }, { db });

    const second = initState("guild-2", "meepo_awaken", 99, "different_scene", { db });
    expect(second.script_version).toBe(1);
    expect(second.current_scene).toBe("cold_open");
    expect(second.progress_json).toMatchObject({ dm_user_id: "u-123" });

    const loaded = loadState("guild-2", "meepo_awaken", { db });
    expect(loaded?.progress_json).toMatchObject({ dm_user_id: "u-123" });
    db.close();
  });

  test("advanceScene resets beat index after setBeatIndex", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-awaken-state-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { getDbForCampaign } = await import("../../db.js");
    const {
      initState,
      setBeatIndex,
      advanceScene,
      loadState,
    } = await import("../awakeningStateRepo.js");

    const db = getDbForCampaign("default");
    initState("guild-3", "meepo_awaken", 1, "cold_open", { db });
    setBeatIndex("guild-3", "meepo_awaken", 2, { db });
    advanceScene("guild-3", "meepo_awaken", "dm_role", { db });

    const loaded = loadState("guild-3", "meepo_awaken", { db });
    expect(loaded?.current_scene).toBe("dm_role");
    expect(loaded?.beat_index).toBe(0);
    db.close();
  });

  test("markComplete persists and survives module reload restart", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-awaken-state-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const campaignSlug = "default";

    {
      const { getDbForCampaign } = await import("../../db.js");
      const {
        initState,
        markComplete,
      } = await import("../awakeningStateRepo.js");

      const db = getDbForCampaign(campaignSlug);
      initState("guild-4", "meepo_awaken", 1, "cold_open", { db });
      const completed = markComplete("guild-4", "meepo_awaken", { db });
      expect(completed.completed).toBe(true);
      db.close();
    }

    vi.resetModules();

    {
      const { getDbForCampaign } = await import("../../db.js");
      const { loadState } = await import("../awakeningStateRepo.js");
      const db = getDbForCampaign(campaignSlug);
      const loaded = loadState("guild-4", "meepo_awaken", { db });
      expect(loaded?.completed).toBe(true);
      db.close();
    }
  });
});
