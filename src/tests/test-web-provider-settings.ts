// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

process.env.DISCORD_TOKEN ??= "test-token";

const tempDirs: string[] = [];

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("MIGRATIONS_SILENT", "1");
  vi.stubEnv("DEFAULT_CAMPAIGN_SLUG", "default");
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
      // Ignore transient Windows cleanup locks.
    }
  }
});

describe("web provider settings", () => {
  it("shows only dashboard-writable guilds and exposes effective provider state", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-web-provider-settings-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);
    vi.stubEnv("GOOGLE_API_KEY", "google-test-key");
    vi.doMock("../../apps/web/lib/server/campaignReaders", () => ({
      listWebCampaignsForGuilds: vi.fn().mockResolvedValue({
        campaigns: [
          {
            slug: "default",
            guildId: "guild-a",
            name: "Guild A",
            guildName: "Guild A",
            guildIconUrl: null,
            isDm: true,
            description: "",
            sessionCount: 1,
            lastSessionDate: "2026-03-17",
            sessions: [],
            type: "user",
            editable: true,
            persisted: true,
            canWrite: true,
          },
          {
            slug: "default",
            guildId: "guild-b",
            name: "Guild B",
            guildName: "Guild B",
            guildIconUrl: null,
            isDm: false,
            description: "",
            sessionCount: 1,
            lastSessionDate: "2026-03-17",
            sessions: [],
            type: "user",
            editable: true,
            persisted: true,
            canWrite: false,
            readOnlyReason: "not_campaign_dm",
          },
        ],
        wordsRecorded: 0,
        emptyGuilds: [],
      }),
    }));

    const { setGuildDmUserId, setGuildLlmProvider, setGuildSttProvider } = await import("../campaign/guildConfig.js");
    const { buildGuildProviderSettingsModel } = await import("../../apps/web/lib/server/providerSettings");

    setGuildDmUserId("guild-a", "dm-user");
    setGuildDmUserId("guild-b", "other-user");
    setGuildSttProvider("guild-a", "deepgram");
    setGuildLlmProvider("guild-a", "google");

    const model = await buildGuildProviderSettingsModel({
      auth: {
        kind: "authenticated",
        source: "session_snapshot",
        user: { id: "dm-user", name: "DM", globalName: "DM" },
        authorizedGuildIds: ["guild-a", "guild-b"],
        authorizedGuilds: [
          { id: "guild-a", name: "Guild A" },
          { id: "guild-b", name: "Guild B" },
        ],
        primaryGuildId: "guild-a",
        devBypass: false,
      },
      requestedGuildId: "guild-a",
    });

    expect(model.selectedGuildId).toBe("guild-a");
    expect(model.guildOptions.map((guild) => guild.guildId)).toEqual(["guild-a"]);
    expect(model.canWriteSelectedGuild).toBe(true);
    expect(model.effectiveSttProvider).toBe("deepgram");
    expect(model.effectiveLlmProvider).toBe("google");
    expect(model.llmCredentialConfigured).toBe(true);
    expect(model.llmCredentialEnvKey).toBe("GOOGLE_API_KEY");
  });

  it("rejects settings access when the user has no dashboard-writable guilds", async () => {
    vi.doMock("../../apps/web/lib/server/campaignReaders", () => ({
      listWebCampaignsForGuilds: vi.fn().mockResolvedValue({
        campaigns: [
          {
            slug: "default",
            guildId: "guild-a",
            name: "Guild A",
            guildName: "Guild A",
            guildIconUrl: null,
            isDm: false,
            description: "",
            sessionCount: 1,
            lastSessionDate: "2026-03-17",
            sessions: [],
            type: "user",
            editable: true,
            persisted: true,
            canWrite: false,
            readOnlyReason: "not_campaign_dm",
          },
        ],
        wordsRecorded: 0,
        emptyGuilds: [],
      }),
    }));

    const { buildGuildProviderSettingsModel } = await import("../../apps/web/lib/server/providerSettings");

    await expect(
      buildGuildProviderSettingsModel({
        auth: {
          kind: "authenticated",
          source: "session_snapshot",
          user: { id: "user-1", name: "User", globalName: null },
          authorizedGuildIds: ["guild-a"],
          authorizedGuilds: [{ id: "guild-a", name: "Guild A" }],
          primaryGuildId: "guild-a",
          devBypass: false,
        },
      })
    ).rejects.toThrow(/DM access in the dashboard/);
  });
});