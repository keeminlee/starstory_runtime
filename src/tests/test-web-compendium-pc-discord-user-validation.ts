// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveWebAuthContext } from "../../apps/web/lib/server/authContext";

process.env.DISCORD_TOKEN ??= "test-token";
process.env.OPENAI_API_KEY ??= "test-openai-key";

const tempDirs: string[] = [];

vi.mock("../../apps/web/lib/server/authContext", async () => {
  const actual = await vi.importActual<typeof import("../../apps/web/lib/server/authContext")>(
    "../../apps/web/lib/server/authContext"
  );
  return {
    ...actual,
    resolveWebAuthContext: vi.fn(),
  };
});

function configureHermeticEnv(tempDir: string): void {
  vi.stubEnv("DATA_ROOT", tempDir);
  vi.stubEnv("DATA_CAMPAIGNS_DIR", "campaigns");
  vi.stubEnv("DATA_DB_FILENAME", "db.sqlite");
  vi.stubEnv("MIGRATIONS_SILENT", "1");
  vi.stubEnv("DEFAULT_CAMPAIGN_SLUG", "default");
}

async function setAuth(args: {
  userId: string;
  guilds: Array<{ id: string; name?: string; iconUrl?: string }>;
}): Promise<void> {
  const mocked = vi.mocked(resolveWebAuthContext);
  const guildIds = args.guilds.map((guild) => guild.id);
  mocked.mockResolvedValue({
    kind: "authenticated",
    source: "session_snapshot",
    user: { id: args.userId, name: "Tester", globalName: "Tester" },
    authorizedGuildIds: guildIds,
    authorizedGuilds: args.guilds,
    primaryGuildId: guildIds[0] ?? null,
    devBypass: false,
  } as any);
}

async function setupCampaign(args: { guildId: string; dmUserId: string; campaignName: string }): Promise<string> {
  const { getDbForCampaign } = await import("../db.js");
  const {
    ensureGuildConfig,
    setGuildCampaignSlug,
    setGuildMetaCampaignSlug,
    setGuildDmUserId,
  } = await import("../campaign/guildConfig.js");
  const { createShowtimeCampaign } = await import("../campaign/showtimeCampaigns.js");

  const db = getDbForCampaign("default");
  const cfg = ensureGuildConfig(args.guildId, "Guild One");
  setGuildMetaCampaignSlug(args.guildId, cfg.campaign_slug);
  setGuildDmUserId(args.guildId, args.dmUserId);

  const campaign = createShowtimeCampaign({
    guildId: args.guildId,
    campaignName: args.campaignName,
    createdByUserId: args.dmUserId,
  });
  setGuildCampaignSlug(args.guildId, campaign.campaign_slug);
  db.close();

  return campaign.campaign_slug;
}

function makeUniqueCampaignName(base: string, tempDir: string): string {
  const suffix = path.basename(tempDir).replace(/[^a-z0-9-]/gi, "").toLowerCase();
  return `${base}-${suffix}`;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore transient Windows file lock cleanup on Windows.
    }
  }
});

describe("compendium PC discord-user validation", () => {
  test("list reads are isolated to the authorized campaign guild", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-web-pc-users-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const otherGuildId = "guild-2";
    const dmUserId = "dm-1";
    const campaignSlug = await setupCampaign({
      guildId,
      dmUserId,
      campaignName: makeUniqueCampaignName("Compendium Alpha", tempDir),
    });
    await setupCampaign({
      guildId: otherGuildId,
      dmUserId,
      campaignName: makeUniqueCampaignName("Compendium Beta", `${tempDir}-b`),
    });

    const { upsertGuildSeenDiscordUser } = await import("../campaign/guildSeenDiscordUsers.js");
    const { listWebSeenDiscordUsers } = await import("../../apps/web/lib/server/registryService");

    upsertGuildSeenDiscordUser({ guildId, discordUserId: "user-a", nickname: "Alpha", seenAtMs: 1 });
    upsertGuildSeenDiscordUser({ guildId: otherGuildId, discordUserId: "user-b", nickname: "Beta", seenAtMs: 2 });

    await setAuth({ userId: dmUserId, guilds: [{ id: guildId, name: "Guild One" }, { id: otherGuildId, name: "Guild Two" }] });

    const users = await listWebSeenDiscordUsers({ campaignSlug, searchParams: { guild_id: guildId } });
    expect(users).toEqual([{ discordUserId: "user-a", nickname: "Alpha", username: null }]);
  });

  test("PC writes require a known guild-scoped discord user id", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-web-pc-validation-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const otherGuildId = "guild-2";
    const dmUserId = "dm-1";
    const campaignSlug = await setupCampaign({
      guildId,
      dmUserId,
      campaignName: makeUniqueCampaignName("Compendium Alpha", tempDir),
    });
    await setupCampaign({
      guildId: otherGuildId,
      dmUserId,
      campaignName: makeUniqueCampaignName("Compendium Beta", `${tempDir}-b`),
    });

    const { upsertGuildSeenDiscordUser } = await import("../campaign/guildSeenDiscordUsers.js");
    const {
      createWebRegistryEntry,
      updateWebRegistryEntry,
    } = await import("../../apps/web/lib/server/registryService");
    const { getRegistryDirForScope } = await import("../registry/scaffold.js");

    upsertGuildSeenDiscordUser({ guildId, discordUserId: "known-user", nickname: "Known", seenAtMs: 1 });
    upsertGuildSeenDiscordUser({ guildId: otherGuildId, discordUserId: "other-user", nickname: "Other", seenAtMs: 1 });

    await setAuth({ userId: dmUserId, guilds: [{ id: guildId, name: "Guild One" }, { id: otherGuildId, name: "Guild Two" }] });

    await expect(
      createWebRegistryEntry({
        campaignSlug,
        body: {
          category: "pcs",
          canonicalName: "Sen",
          aliases: [],
          notes: "",
        } as any,
      })
    ).rejects.toMatchObject({ code: "invalid_request", status: 422 });

    await expect(
      createWebRegistryEntry({
        campaignSlug,
        body: {
          category: "pcs",
          canonicalName: "Sen",
          aliases: [],
          notes: "",
          discordUserId: "other-user",
        },
      })
    ).rejects.toMatchObject({ code: "invalid_request", status: 422 });

    const created = await createWebRegistryEntry({
      campaignSlug,
      body: {
        category: "pcs",
        canonicalName: "Sen",
        aliases: [],
        notes: "",
        discordUserId: "known-user",
      },
    });
    expect(created.categories.pcs.find((entry) => entry.canonicalName === "Sen")?.discordUserId).toBe("known-user");

    const registryDir = getRegistryDirForScope({ guildId, campaignSlug, baseDir: path.join(tempDir, "registry") });
    fs.mkdirSync(registryDir, { recursive: true });
    fs.writeFileSync(
      path.join(registryDir, "pcs.yml"),
      [
        "version: 1",
        "characters:",
        "  - id: pc_legacy",
        "    canonical_name: Legacy PC",
        "    aliases: []",
        "    notes: legacy",
        "",
      ].join("\n")
    );

    await expect(
      updateWebRegistryEntry({
        campaignSlug,
        entryId: "pc_legacy",
        body: {
          category: "pcs",
          canonicalName: "Legacy PC",
          aliases: [],
          notes: "legacy updated",
        } as any,
      })
    ).rejects.toMatchObject({ code: "invalid_request", status: 422 });
  });

  test("PC writes reject duplicate discord-user ownership before mutating the registry", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-web-pc-duplicate-user-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const campaignSlug = await setupCampaign({
      guildId,
      dmUserId,
      campaignName: makeUniqueCampaignName("Compendium Gamma", tempDir),
    });

    const {
      createWebRegistryEntry,
      getWebRegistrySnapshot,
    } = await import("../../apps/web/lib/server/registryService");
    const { upsertGuildSeenDiscordUser } = await import("../campaign/guildSeenDiscordUsers.js");

    upsertGuildSeenDiscordUser({ guildId, discordUserId: "known-user", nickname: "Known", seenAtMs: 1 });

    await setAuth({ userId: dmUserId, guilds: [{ id: guildId, name: "Guild One" }] });

    await createWebRegistryEntry({
      campaignSlug,
      body: {
        category: "pcs",
        canonicalName: "Minx",
        aliases: [],
        notes: "",
        discordUserId: "known-user",
      },
    });

    await expect(
      createWebRegistryEntry({
        campaignSlug,
        body: {
          category: "pcs",
          canonicalName: "Kenan",
          aliases: [],
          notes: "",
          discordUserId: "known-user",
        },
      })
    ).rejects.toMatchObject({ code: "conflict", status: 409 });

    const snapshot = await getWebRegistrySnapshot({ campaignSlug, searchParams: { guild_id: guildId } });
    expect(snapshot.categories.pcs.filter((entry) => entry.discordUserId === "known-user")).toHaveLength(1);
    expect(snapshot.categories.pcs.find((entry) => entry.discordUserId === "known-user")?.canonicalName).toBe("Minx");
  });
});