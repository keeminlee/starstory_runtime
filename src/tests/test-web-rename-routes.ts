// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { resolveWebAuthContext } from "../../apps/web/lib/server/authContext";

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
      // ignore windows cleanup flake
    }
  }
});

async function setupGuildCampaignAndSession(args: {
  guildId: string;
  dmUserId: string;
  playerUserId: string;
}): Promise<{ campaignSlug: string; sessionId: string }> {
  await setAuth({ userId: args.playerUserId, guilds: [{ id: args.guildId, name: "Guild One" }] });

  const { getDbForCampaign } = await import("../db.js");
  const {
    ensureGuildConfig,
    setGuildCampaignSlug,
    setGuildMetaCampaignSlug,
    setGuildDmUserId,
  } = await import("../campaign/guildConfig.js");
  const { createShowtimeCampaign } = await import("../campaign/showtimeCampaigns.js");
  const { startSession, endSession, getMostRecentSession } = await import("../sessions/sessions.js");

  getDbForCampaign("default");
  const cfg = ensureGuildConfig(args.guildId, "Guild One");
  setGuildMetaCampaignSlug(args.guildId, cfg.campaign_slug);
  setGuildDmUserId(args.guildId, args.dmUserId);

  const campaign = createShowtimeCampaign({
    guildId: args.guildId,
    campaignName: "Campaign Alpha",
    createdByUserId: args.dmUserId,
    dmUserId: args.dmUserId,
  });
  setGuildCampaignSlug(args.guildId, campaign.campaign_slug);

  startSession(args.guildId, args.dmUserId, "DM", {
    source: "live",
    kind: "canon",
    modeAtStart: "canon",
  });
  endSession(args.guildId, "showtime_end");

  const session = getMostRecentSession(args.guildId);
  return { campaignSlug: campaign.campaign_slug, sessionId: session!.session_id };
}

describe("web rename PATCH routes", () => {
  test("campaign PATCH rejects unauthorized edits, validates input, and preserves slug identity", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-web-rename-route-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const playerUserId = "player-1";
    const { campaignSlug } = await setupGuildCampaignAndSession({ guildId, dmUserId, playerUserId });
    const { PATCH } = await import("../../apps/web/app/api/campaigns/[campaignSlug]/route");

    await setAuth({ userId: playerUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const unauthorizedResponse = await PATCH(
      new NextRequest(`http://localhost/api/campaigns/${campaignSlug}`, {
        method: "PATCH",
        body: JSON.stringify({ campaignName: "Player Rename" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ campaignSlug }) }
    );

    expect(unauthorizedResponse.status).toBe(403);

    await setAuth({ userId: dmUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const emptyNameResponse = await PATCH(
      new NextRequest(`http://localhost/api/campaigns/${campaignSlug}`, {
        method: "PATCH",
        body: JSON.stringify({ campaignName: "   " }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ campaignSlug }) }
    );

    expect(emptyNameResponse.status).toBe(422);

    const longNameResponse = await PATCH(
      new NextRequest(`http://localhost/api/campaigns/${campaignSlug}`, {
        method: "PATCH",
        body: JSON.stringify({ campaignName: "A".repeat(101) }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ campaignSlug }) }
    );

    expect(longNameResponse.status).toBe(422);

    const authorizedResponse = await PATCH(
      new NextRequest(`http://localhost/api/campaigns/${campaignSlug}`, {
        method: "PATCH",
        body: JSON.stringify({ campaignName: "DM Rename" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ campaignSlug }) }
    );

    expect(authorizedResponse.status).toBe(200);
    const payload = await authorizedResponse.json();
    expect(payload.campaign.slug).toBe(campaignSlug);
    expect(payload.campaign.name).toBe("DM Rename");
  });

  test("session PATCH rejects unauthorized edits and invalid payloads", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-web-rename-route-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const playerUserId = "player-1";
    const { sessionId } = await setupGuildCampaignAndSession({ guildId, dmUserId, playerUserId });
    const { PATCH } = await import("../../apps/web/app/api/sessions/[sessionId]/route");

    await setAuth({ userId: playerUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const unauthorizedResponse = await PATCH(
      new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ label: "Player Rename" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ sessionId }) }
    );

    expect(unauthorizedResponse.status).toBe(403);

    await setAuth({ userId: dmUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const invalidResponse = await PATCH(
      new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ label: 42 }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ sessionId }) }
    );

    expect(invalidResponse.status).toBe(422);
  });
});