// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveWebAuthContext } from "../../apps/web/lib/server/authContext";
import { WebDataError } from "../../apps/web/lib/mappers/errorMappers";

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

async function getSessionReaders() {
  return await import("../../apps/web/lib/server/sessionReaders");
}

async function getCampaignReaders() {
  return await import("../../apps/web/lib/server/campaignReaders");
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
      // Ignore transient file lock cleanup on Windows.
    }
  }
});

async function setupGuildCampaignAndSession(args: {
  guildId: string;
  dmUserId: string;
  playerUserId: string;
  campaignDmUserId?: string;
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

  const db = getDbForCampaign("default");
  const cfg = ensureGuildConfig(args.guildId, "Guild One");
  setGuildMetaCampaignSlug(args.guildId, cfg.campaign_slug);
  setGuildDmUserId(args.guildId, args.dmUserId);

  const campaign = createShowtimeCampaign({
    guildId: args.guildId,
    campaignName: "Campaign Alpha",
    createdByUserId: args.campaignDmUserId ?? args.dmUserId,
    dmUserId: args.campaignDmUserId ?? args.dmUserId,
  });
  setGuildCampaignSlug(args.guildId, campaign.campaign_slug);

  startSession(args.guildId, args.dmUserId, "DM", {
    source: "live",
    kind: "canon",
    modeAtStart: "canon",
  });
  endSession(args.guildId, "showtime_end");

  const session = getMostRecentSession(args.guildId);
  expect(session?.session_id).toBeTruthy();

  return {
    campaignSlug: campaign.campaign_slug,
    sessionId: session!.session_id,
  };
}

async function setupGuildCampaignWithActiveSession(args: {
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
  const { startSession, getMostRecentSession } = await import("../sessions/sessions.js");

  const db = getDbForCampaign("default");
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

  const session = getMostRecentSession(args.guildId);
  expect(session?.session_id).toBeTruthy();

  return {
    campaignSlug: campaign.campaign_slug,
    sessionId: session!.session_id,
  };
}

async function seedSessionTranscript(args: {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
  playerUserId: string;
  dmUserId: string;
}): Promise<void> {
  const { getDbForCampaign } = await import("../db.js");
  const db = getDbForCampaign(args.campaignSlug);
  const now = Date.now();

  db.prepare(
    `INSERT INTO ledger_entries (
      id, guild_id, channel_id, message_id, author_id, author_name,
      timestamp_ms, content, content_norm, session_id, tags, source, narrative_weight, speaker_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `${args.sessionId}-speaker-player`,
    args.guildId,
    "channel-1",
    `${args.sessionId}-speaker-player-msg`,
    args.playerUserId,
    "Jamison",
    now - 2_000,
    "I scout ahead.",
    "I scout ahead.",
    args.sessionId,
    "human",
    "text",
    "primary",
    null,
  );

  db.prepare(
    `INSERT INTO ledger_entries (
      id, guild_id, channel_id, message_id, author_id, author_name,
      timestamp_ms, content, content_norm, session_id, tags, source, narrative_weight, speaker_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `${args.sessionId}-speaker-dm`,
    args.guildId,
    "channel-1",
    `${args.sessionId}-speaker-dm-msg`,
    "stt-bot",
    "Caterson",
    now - 1_000,
    "The corridor opens into a chapel.",
    "The corridor opens into a chapel.",
    args.sessionId,
    "human",
    "voice",
    "primary",
    args.dmUserId,
  );
}

describe("Phase 5.5 write authority enforcement", () => {
  test("non-DM is denied campaign rename and DM is allowed", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-phase55-auth-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const playerUserId = "player-1";
    const { campaignSlug } = await setupGuildCampaignAndSession({ guildId, dmUserId, playerUserId });

    await setAuth({ userId: playerUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const { updateWebCampaignName } = await getCampaignReaders();
    await expect(
      updateWebCampaignName({ campaignSlug, campaignName: "Player Rename" })
    ).rejects.toMatchObject({ code: "unauthorized", status: 403 });

    await setAuth({ userId: dmUserId, guilds: [{ id: guildId, name: "Guild One" }] });
  const { updateWebCampaignName: updateWebCampaignNameAsDm } = await getCampaignReaders();
  const renamed = await updateWebCampaignNameAsDm({ campaignSlug, campaignName: "DM Rename" });
    expect(renamed.name).toBe("DM Rename");
  });

  test("guild DM is denied when campaign owner is a different user", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-phase55-auth-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const guildDmUserId = "dm-1";
    const campaignOwnerUserId = "dm-2";
    const playerUserId = "player-1";
    const { campaignSlug } = await setupGuildCampaignAndSession({
      guildId,
      dmUserId: guildDmUserId,
      campaignDmUserId: campaignOwnerUserId,
      playerUserId,
    });

    await setAuth({ userId: guildDmUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const { updateWebCampaignName } = await getCampaignReaders();
    await expect(
      updateWebCampaignName({ campaignSlug, campaignName: "Guild DM Rename Attempt" })
    ).rejects.toMatchObject({ code: "unauthorized", status: 403 });

    await setAuth({ userId: campaignOwnerUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const { updateWebCampaignName: updateWebCampaignNameAsOwner } = await getCampaignReaders();
    const renamed = await updateWebCampaignNameAsOwner({ campaignSlug, campaignName: "Campaign Owner Rename" });
    expect(renamed.name).toBe("Campaign Owner Rename");
  });

  test("non-DM is denied session label edit and DM is allowed", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-phase55-auth-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const playerUserId = "player-1";
    const { sessionId } = await setupGuildCampaignAndSession({ guildId, dmUserId, playerUserId });

    await setAuth({ userId: playerUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const { updateWebSessionLabel } = await getSessionReaders();
    await expect(updateWebSessionLabel({ sessionId, label: "Player Label" })).rejects.toMatchObject({
      code: "unauthorized",
      status: 403,
    });

    await setAuth({ userId: dmUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const { updateWebSessionLabel: updateWebSessionLabelAsDm } = await getSessionReaders();
    const updated = await updateWebSessionLabelAsDm({ sessionId, label: "DM Label" });
    expect(updated.label).toBe("DM Label");
  });

  test("guild DM cannot edit session labels when campaign owner differs", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-phase55-auth-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const guildDmUserId = "dm-1";
    const campaignOwnerUserId = "dm-2";
    const playerUserId = "player-1";
    const { sessionId } = await setupGuildCampaignAndSession({
      guildId,
      dmUserId: guildDmUserId,
      campaignDmUserId: campaignOwnerUserId,
      playerUserId,
    });

    await setAuth({ userId: guildDmUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const { updateWebSessionLabel } = await getSessionReaders();
    await expect(updateWebSessionLabel({ sessionId, label: "Guild DM Label Attempt" })).rejects.toMatchObject({
      code: "unauthorized",
      status: 403,
    });

    await setAuth({ userId: campaignOwnerUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const { updateWebSessionLabel: updateWebSessionLabelAsOwner } = await getSessionReaders();
    const updated = await updateWebSessionLabelAsOwner({ sessionId, label: "Campaign Owner Label" });
    expect(updated.label).toBe("Campaign Owner Label");
  });

  test("non-DM is denied recap regenerate before capability checks; DM reaches capability gate", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-phase55-auth-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const playerUserId = "player-1";
    const { sessionId } = await setupGuildCampaignAndSession({ guildId, dmUserId, playerUserId });

    await setAuth({ userId: playerUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const { regenerateWebSessionRecap } = await getSessionReaders();
    await expect(regenerateWebSessionRecap({ sessionId, reason: "test" })).rejects.toMatchObject({
      code: "unauthorized",
      status: 403,
    });

    // Flip capability env only after runtime DB/bootstrap imports are complete.
    vi.stubEnv("OPENAI_API_KEY", "");

    await setAuth({ userId: dmUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const { regenerateWebSessionRecap: regenerateWebSessionRecapAsDm } = await getSessionReaders();
    await expect(regenerateWebSessionRecapAsDm({ sessionId, reason: "test" })).rejects.toMatchObject({
      code: "openai_unconfigured",
      status: 503,
    });
  });
});

describe("Phase 5.5 recap source visibility", () => {
  test("session detail exposes speaker attribution gate state with locked DM row", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-phase55-speaker-detail-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const playerUserId = "player-1";
    const { campaignSlug, sessionId } = await setupGuildCampaignAndSession({ guildId, dmUserId, playerUserId });
    await seedSessionTranscript({ guildId, campaignSlug, sessionId, playerUserId, dmUserId });

    await setAuth({ userId: playerUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const { getWebSessionDetail } = await getSessionReaders();
    const detail = await getWebSessionDetail({ sessionId, searchParams: { campaign_slug: campaignSlug } });

    expect(detail.speakerAttribution?.required).toBe(true);
    expect(detail.speakerAttribution?.ready).toBe(false);
    expect(detail.speakerAttribution?.pendingCount).toBe(1);
    expect(detail.recapPhase).toBe("ended_pending_attribution");
    expect(detail.speakerAttribution?.speakers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          discordUserId: dmUserId,
          classification: expect.objectContaining({
            classificationType: "dm",
            locked: true,
          }),
        }),
      ])
    );
  });

  test("web recap regeneration returns explicit attribution-required error until speakers are classified", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-phase55-speaker-gate-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const playerUserId = "player-1";
    const { campaignSlug, sessionId } = await setupGuildCampaignAndSession({ guildId, dmUserId, playerUserId });
    await seedSessionTranscript({ guildId, campaignSlug, sessionId, playerUserId, dmUserId });

    await setAuth({ userId: dmUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const { regenerateWebSessionRecap } = await getSessionReaders();
    await expect(
      regenerateWebSessionRecap({
        sessionId,
        reason: "manual-web-regenerate",
        searchParams: { campaign_slug: campaignSlug },
      } as any)
    ).rejects.toMatchObject({
      code: "RECAP_SPEAKER_ATTRIBUTION_REQUIRED",
      status: 409,
    });
  });

  test("speaker attribution batch can create a PC inline and unlock recap readiness", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-phase55-speaker-inline-pc-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const playerUserId = "player-1";
    const { campaignSlug, sessionId } = await setupGuildCampaignAndSession({ guildId, dmUserId, playerUserId });
    await seedSessionTranscript({ guildId, campaignSlug, sessionId, playerUserId, dmUserId });

    const { upsertGuildSeenDiscordUser } = await import("../campaign/guildSeenDiscordUsers.js");
    upsertGuildSeenDiscordUser({
      guildId,
      discordUserId: playerUserId,
      nickname: "Jamison",
      username: "jamison",
      seenAtMs: Date.now(),
    });

    await setAuth({ userId: dmUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const { saveSessionSpeakerAttributionBatch } = await import("../../apps/web/lib/server/sessionSpeakerAttributionService");
    const saved = await saveSessionSpeakerAttributionBatch({
      guildId,
      campaignSlug,
      sessionId,
      payload: {
        entries: [
          {
            discordUserId: playerUserId,
            classificationType: "pc",
            createPc: {
              canonicalName: "Jamison",
            },
          },
        ],
      },
    });

    expect(saved.ready).toBe(true);
    expect(saved.availablePcs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonicalName: "Jamison", discordUserId: playerUserId }),
      ])
    );

    const { getWebSessionDetail } = await getSessionReaders();
    const detail = await getWebSessionDetail({ sessionId, searchParams: { campaign_slug: campaignSlug } });
    expect(detail.speakerAttribution?.ready).toBe(true);
    expect(detail.recapPhase).toBe("ended_ready");
    expect(detail.recapReadiness).toBe("ready");
    expect(detail.speakerAttribution?.availablePcs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonicalName: "Jamison" }),
      ])
    );
  });

  test("session detail exposes canonical recap source", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-phase55-recap-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const playerUserId = "player-1";
    const { campaignSlug, sessionId } = await setupGuildCampaignAndSession({ guildId, dmUserId, playerUserId });

    const { upsertSessionRecap } = await import("../sessions/sessionRecaps.js");
    upsertSessionRecap({
      guildId,
      campaignSlug,
      sessionId,
      views: {
        concise: "Canonical concise",
        balanced: "Canonical balanced",
        detailed: "Canonical detailed",
      },
      strategyVersion: "session-recaps-v2",
      engine: "test-engine",
    });

    await setAuth({ userId: playerUserId, guilds: [{ id: guildId, name: "Guild One" }] });
  const { getWebSessionDetail } = await getSessionReaders();
  const detail = await getWebSessionDetail({ sessionId });
    expect(detail.recap?.source).toBe("canonical");
    expect(detail.recap?.balanced).toContain("Canonical balanced");
    expect(detail.recapReadiness).toBe("ready");
    expect(detail.recapPhase).toBe("complete");
  });

  test("session detail exposes failed recap readiness from lifecycle status events", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-phase55-recap-readiness-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const playerUserId = "player-1";
    const { campaignSlug, sessionId } = await setupGuildCampaignAndSession({ guildId, dmUserId, playerUserId });

    const { getDbForCampaign } = await import("../db.js");
    const campaignDb = getDbForCampaign(campaignSlug);
    campaignDb.prepare("DELETE FROM session_recaps WHERE session_id = ?").run(sessionId);
    campaignDb.prepare("DELETE FROM session_artifacts WHERE session_id = ? AND artifact_type = 'recap_final'").run(sessionId);
    campaignDb.prepare("DELETE FROM meecaps WHERE session_id = ?").run(sessionId);
    campaignDb
      .prepare(
        `INSERT INTO ledger_entries (
          id, guild_id, channel_id, message_id, author_id, author_name,
          timestamp_ms, content, content_norm, session_id, tags, source, narrative_weight
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `${sessionId}-recap-status-failed`,
        guildId,
        "channel-1",
        `${sessionId}-recap-status-failed-msg`,
        "system",
        "SYSTEM",
        Date.now(),
        JSON.stringify({ event_type: "SESSION_RECAP_STATUS", readiness: "failed", reason: "postsession_retries_exhausted" }),
        null,
        sessionId,
        "system,SESSION_RECAP_STATUS",
        "system",
        "secondary"
      );
    await setAuth({ userId: playerUserId, guilds: [{ id: guildId, name: "Guild One" }] });
  const { getWebSessionDetail } = await getSessionReaders();
  const detail = await getWebSessionDetail({ sessionId });
    expect(detail.recap).toBeNull();
    expect(detail.recapReadiness).toBe("failed");
    expect(detail.recapPhase).toBe("failed");
  });

  test("active session detail reports live recap phase and blocks recap regeneration", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-phase55-recap-live-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const playerUserId = "player-1";
    const { campaignSlug, sessionId } = await setupGuildCampaignWithActiveSession({ guildId, dmUserId, playerUserId });

    await setAuth({ userId: dmUserId, guilds: [{ id: guildId, name: "Guild One" }] });
    const { getWebSessionDetail, regenerateWebSessionRecap } = await getSessionReaders();
    const detail = await getWebSessionDetail({ sessionId, searchParams: { campaign_slug: campaignSlug } });

    expect(detail.status).toBe("in_progress");
    expect(detail.recapPhase).toBe("live");

    await expect(
      regenerateWebSessionRecap({
        sessionId,
        reason: "manual-web-regenerate",
        searchParams: { campaign_slug: campaignSlug },
      } as any)
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    });
  });

  test("session detail exposes legacy artifact recap source when canonical row is absent", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-phase55-recap-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const playerUserId = "player-1";
    const { campaignSlug, sessionId } = await setupGuildCampaignAndSession({ guildId, dmUserId, playerUserId });

    const { getDbForCampaign } = await import("../db.js");
    const campaignDb = getDbForCampaign(campaignSlug);
    campaignDb.prepare("DELETE FROM session_recaps WHERE session_id = ?").run(sessionId);
    campaignDb
      .prepare(
        `INSERT INTO session_artifacts (session_id, artifact_type, content_text, created_at_ms, engine, source_hash, strategy_version, meta_json)
         VALUES (?, 'recap_final', ?, ?, ?, NULL, ?, NULL)`
      )
      .run(sessionId, "Legacy artifact recap", Date.now(), "legacy-engine", "legacy-v1");
    await setAuth({ userId: playerUserId, guilds: [{ id: guildId, name: "Guild One" }] });
  const { getWebSessionDetail } = await getSessionReaders();
  const detail = await getWebSessionDetail({ sessionId });
    expect(detail.recap?.source).toBe("legacy_artifact");
    expect(detail.recap?.balanced).toContain("Legacy artifact recap");
    expect(detail.recap?.concise).toBe("");
    expect(detail.recap?.detailed).toBe("");
  });

  test("session detail exposes legacy meecap source when canonical + artifact rows are absent", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-phase55-recap-"));
    tempDirs.push(tempDir);
    configureHermeticEnv(tempDir);

    const guildId = "guild-1";
    const dmUserId = "dm-1";
    const playerUserId = "player-1";
    const { campaignSlug, sessionId } = await setupGuildCampaignAndSession({ guildId, dmUserId, playerUserId });

    const { getDbForCampaign } = await import("../db.js");
    const campaignDb = getDbForCampaign(campaignSlug);
    campaignDb.prepare("DELETE FROM session_recaps WHERE session_id = ?").run(sessionId);
    campaignDb.prepare("DELETE FROM session_artifacts WHERE session_id = ? AND artifact_type = 'recap_final'").run(sessionId);
    campaignDb
      .prepare(
        `INSERT INTO meecaps (session_id, meecap_narrative, model, created_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(sessionId, "Legacy meecap narrative", "legacy-meecap-model", Date.now() - 1000, Date.now());
    await setAuth({ userId: playerUserId, guilds: [{ id: guildId, name: "Guild One" }] });
  const { getWebSessionDetail } = await getSessionReaders();
  const detail = await getWebSessionDetail({ sessionId });
    expect(detail.recap?.source).toBe("legacy_meecap");
    expect(detail.recap?.balanced).toContain("Legacy meecap narrative");
    expect(detail.recap?.concise).toBe("");
    expect(detail.recap?.detailed).toBe("");
  });
});