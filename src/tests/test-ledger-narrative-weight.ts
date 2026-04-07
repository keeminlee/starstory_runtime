import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const tempDirs: string[] = [];

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup on Windows.
    }
  }
});

test("appendLedgerEntry coerces voice rows away from secondary narrative weight", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-ledger-voice-weight-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const { resolveCampaignSlug } = await import("../campaign/guildConfig.js");
  const { getDbForCampaign } = await import("../db.js");
  const { appendLedgerEntry } = await import("../ledger/ledger.js");

  const guildId = "guild-ledger-voice-weight";
  const entryId = appendLedgerEntry({
    guild_id: guildId,
    channel_id: "channel-1",
    message_id: "voice-msg-1",
    author_id: "user-1",
    author_name: "Speaker",
    timestamp_ms: Date.now(),
    content: "Hello from voice",
    source: "voice",
    narrative_weight: "secondary",
  });

  const db = getDbForCampaign(resolveCampaignSlug({ guildId }));
  const row = db
    .prepare("SELECT source, narrative_weight FROM ledger_entries WHERE id = ?")
    .get(entryId) as { source: string; narrative_weight: string } | undefined;

  expect(row).toEqual({ source: "voice", narrative_weight: "primary" });
});

test("appendLedgerEntry preserves elevated voice rows", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-ledger-voice-elevated-"));
  tempDirs.push(tempDir);
  configureHermeticEnv(tempDir);

  const { resolveCampaignSlug } = await import("../campaign/guildConfig.js");
  const { getDbForCampaign } = await import("../db.js");
  const { appendLedgerEntry } = await import("../ledger/ledger.js");

  const guildId = "guild-ledger-voice-elevated";
  const entryId = appendLedgerEntry({
    guild_id: guildId,
    channel_id: "channel-1",
    message_id: "voice-msg-2",
    author_id: "user-1",
    author_name: "Speaker",
    timestamp_ms: Date.now(),
    content: "Important voice line",
    source: "voice",
    narrative_weight: "elevated",
  });

  const db = getDbForCampaign(resolveCampaignSlug({ guildId }));
  const row = db
    .prepare("SELECT source, narrative_weight FROM ledger_entries WHERE id = ?")
    .get(entryId) as { source: string; narrative_weight: string } | undefined;

  expect(row).toEqual({ source: "voice", narrative_weight: "elevated" });
});
