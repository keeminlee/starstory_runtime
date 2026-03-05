import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { BuildMeepoPromptBundleInput } from "../../llm/promptBundleTypes.js";

const tempDirs: string[] = [];

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
  vi.stubEnv("MIGRATIONS_SILENT", "1");
}

function createPersona(args: {
  id: string;
  scope: "campaign" | "meta";
}): BuildMeepoPromptBundleInput["persona"] {
  return {
    id: args.id,
    displayName: "Test Persona",
    scope: args.scope,
    systemGuardrails: "guard",
    identity: "identity",
    speechStyle: "style",
    personalityTone: "tone",
    styleGuard: "sg",
    styleSpec: {
      name: "Test",
      voice: "neutral",
      punctuation: "low",
      caps: "never",
    },
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

describe("dm display name memory round trip", () => {
  test("does not inject dm_display_name for diegetic persona", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-dm-roundtrip-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { getDbForCampaign } = await import("../../db.js");
    const { upsertDmDisplayNameMemory } = await import("../meepoMindWriter.js");
    const { buildMeepoPromptBundle } = await import("../../llm/buildMeepoPromptBundle.js");

    const db = getDbForCampaign("default");
    upsertDmDisplayNameMemory({
      db,
      guildId: "guild-1",
      displayName: "ZZZ_TEST_DM_NAME",
      source: "awakening",
    });

    const bundle = buildMeepoPromptBundle({
      guild_id: "guild-1",
      campaign_slug: "default",
      session_id: "__ambient__",
      anchor_ledger_id: "anchor-1",
      mode_at_start: "canon",
      is_meta_prompt: false,
      user_text: "hello",
      meepo_context_snapshot: { context: "ctx" },
      persona: createPersona({ id: "diegetic_meepo", scope: "campaign" }),
    });

    expect(bundle.system).not.toContain("ZZZ_TEST_DM_NAME");
    db.close();
  });

  test("repair preflight restores keyed memory from onboarding state and meta prompt includes it", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-dm-roundtrip-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { getDbForCampaign } = await import("../../db.js");
    const { initState, saveProgress } = await import("../../ledger/awakeningStateRepo.js");
    const { repairDmDisplayNameMemory } = await import("../../awakening/wakeIdentity.js");
    const { getGuildMemoryByKey } = await import("../meepoMindMemoryRepo.js");
    const { DM_DISPLAY_NAME_KEY } = await import("../meepoMindWriter.js");
    const { buildMeepoPromptBundle } = await import("../../llm/buildMeepoPromptBundle.js");

    const db = getDbForCampaign("default");
    initState("guild-1", "meepo_awaken", 1, "ask_dm_name", { db });
    saveProgress("guild-1", "meepo_awaken", { dm_display_name: "ZZZ_TEST_DM_NAME" }, { db });

    const before = getGuildMemoryByKey({
      db,
      guildId: "guild-1",
      key: DM_DISPLAY_NAME_KEY,
    });
    expect(before).toBeNull();

    const repairResult = repairDmDisplayNameMemory({
      db,
      guildId: "guild-1",
      scriptId: "meepo_awaken",
    });

    expect(repairResult.repaired).toBe(true);

    const after = getGuildMemoryByKey({
      db,
      guildId: "guild-1",
      key: DM_DISPLAY_NAME_KEY,
    });
    expect(after?.text).toContain("ZZZ_TEST_DM_NAME");

    const bundle = buildMeepoPromptBundle({
      guild_id: "guild-1",
      campaign_slug: "default",
      session_id: "__ambient__",
      anchor_ledger_id: "anchor-2",
      mode_at_start: "ambient",
      is_meta_prompt: true,
      user_text: "hello",
      meepo_context_snapshot: { context: "ctx" },
      persona: createPersona({ id: "meta_meepo", scope: "meta" }),
    });

    expect(bundle.system).toContain("ZZZ_TEST_DM_NAME");
    db.close();
  });
});
