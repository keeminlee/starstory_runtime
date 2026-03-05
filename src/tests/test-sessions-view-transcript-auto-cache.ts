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
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore transient Windows file lock cleanup failures in test teardown.
      }
    }
  }
});

describe("sessions view transcript auto-cache", () => {
  test("ensureBronzeTranscriptExportCached writes deterministic export and is idempotent", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-transcript-cache-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const { getDbForCampaign } = await import("../db.js");
    const { startSession } = await import("../sessions/sessions.js");
    const { ensureBronzeTranscriptExportCached } = await import("../sessions/transcriptExport.js");
    const { resolveCampaignTranscriptExportsDir } = await import("../dataPaths.js");

    const db = getDbForCampaign("default");
    const session = startSession("guild-1", "user-1", "Tester", {
      label: "C2E-AUTO",
      kind: "canon",
      modeAtStart: "canon",
      source: "live",
    });

    const insertBronze = db.prepare(
      `INSERT INTO bronze_transcript (
        session_id, line_index, author_name, content, timestamp_ms, source_type, source_ids, compiled_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    insertBronze.run(
      session.session_id,
      0,
      "DM",
      "Welcome to the table.",
      1_700_000_000_000,
      "voice_fused",
      JSON.stringify(["ledger-001", "ledger-002"]),
      Date.now()
    );
    insertBronze.run(
      session.session_id,
      1,
      "Panda",
      "I check the door.",
      1_700_000_000_050,
      "voice",
      JSON.stringify(["ledger-003"]),
      Date.now()
    );

    const first = ensureBronzeTranscriptExportCached({
      guildId: "guild-1",
      campaignSlug: "default",
      sessionId: session.session_id,
      sessionLabel: session.label,
      db,
    });

    expect(first.cacheHit).toBe(false);
    expect(fs.existsSync(first.path)).toBe(true);

    const firstContent = fs.readFileSync(first.path, "utf8");
    expect(firstContent).toContain("DM: Welcome to the table.");
    expect(firstContent).toContain("Panda: I check the door.");
    expect(firstContent).not.toContain("[Lledger-");

    const second = ensureBronzeTranscriptExportCached({
      guildId: "guild-1",
      campaignSlug: "default",
      sessionId: session.session_id,
      sessionLabel: session.label,
      db,
    });

    expect(second.cacheHit).toBe(true);
    expect(second.hash).toBe(first.hash);
    expect(second.bytes).toBe(first.bytes);

    const secondContent = fs.readFileSync(second.path, "utf8");
    expect(secondContent).toBe(firstContent);

    const expectedDir = resolveCampaignTranscriptExportsDir("default", "online", { forWrite: false });
    expect(path.dirname(second.path)).toBe(expectedDir);

    db.close();
  });
});