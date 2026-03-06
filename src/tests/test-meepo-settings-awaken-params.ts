import { afterEach, describe, expect, test, vi } from "vitest";

let configuredDmUserId: string | null = "dm-user";
let configuredDmRoleId: string | null = "role-1";
let configuredDefaultTalkMode: "hush" | "talk" | null = "hush";

const setGuildHomeTextChannelIdMock = vi.fn();
const setGuildHomeVoiceChannelIdMock = vi.fn();
const setGuildDmRoleIdMock = vi.fn();
const setGuildDefaultTalkModeMock = vi.fn();
const upsertDmDisplayNameMemoryMock = vi.fn();

vi.mock("../security/isElevated.js", () => ({
  isElevated: vi.fn(() => false),
}));

vi.mock("../campaign/guildConfig.js", () => ({
  getGuildCanonPersonaId: vi.fn(() => null),
  getGuildCanonPersonaMode: vi.fn(() => "meta"),
  getGuildConfig: vi.fn(() => ({
    campaign_slug: "default",
    setup_version: 2,
    home_text_channel_id: "text-1",
    home_voice_channel_id: "voice-1",
    awakened: 1,
    dm_user_id: configuredDmUserId,
  })),
  getGuildDmRoleId: vi.fn(() => configuredDmRoleId),
  getGuildDmUserId: vi.fn(() => configuredDmUserId),
  getGuildDefaultTalkMode: vi.fn(() => configuredDefaultTalkMode),
  getGuildDefaultRecapStyle: vi.fn(() => "balanced"),
  getGuildHomeTextChannelId: vi.fn(() => "text-1"),
  getGuildHomeVoiceChannelId: vi.fn(() => "voice-1"),
  getGuildSetupVersion: vi.fn(() => 2),
  resolveGuildHomeVoiceChannelId: vi.fn(() => "voice-1"),
  setGuildDefaultTalkMode: setGuildDefaultTalkModeMock,
  setGuildDmRoleId: setGuildDmRoleIdMock,
  setGuildHomeTextChannelId: setGuildHomeTextChannelIdMock,
  setGuildHomeVoiceChannelId: setGuildHomeVoiceChannelIdMock,
}));

vi.mock("../meepoMind/meepoMindWriter.js", () => ({
  DM_DISPLAY_NAME_KEY: "dm_display_name",
  upsertDmDisplayNameMemory: upsertDmDisplayNameMemoryMock,
}));

vi.mock("../meepoMind/meepoMindMemoryRepo.js", () => ({
  getGuildMemoryByKey: vi.fn(() => ({ text: "The Dungeon Master is Mina." })),
}));

vi.mock("../voice/stt/promptState.js", () => ({
  getGuildSttPrompt: vi.fn(() => "Guild STT Prompt"),
}));

function stubCoreEnv(): void {
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("OPENAI_API_KEY", "test-openai");
}

function buildInteraction(args: {
  sub: string;
  userId?: string;
  hasManageGuild?: boolean;
  channel?: any;
  role?: any;
  mode?: string;
  name?: string;
}) {
  const reply = vi.fn(async (_payload: any) => undefined);
  return {
    guildId: "guild-1",
    guild: {},
    member: {},
    memberPermissions: {
      has: vi.fn(() => Boolean(args.hasManageGuild)),
    },
    user: {
      id: args.userId ?? "dm-user",
    },
    options: {
      getSubcommandGroup: vi.fn(() => "settings"),
      getSubcommand: vi.fn(() => args.sub),
      getChannel: vi.fn(() => args.channel ?? null),
      getRole: vi.fn(() => args.role ?? null),
      getString: vi.fn((name: string) => {
        if (name === "mode") return args.mode ?? null;
        if (name === "name") return args.name ?? null;
        return null;
      }),
    },
    reply,
  };
}

afterEach(() => {
  configuredDmUserId = "dm-user";
  configuredDmRoleId = "role-1";
  configuredDefaultTalkMode = "hush";
  setGuildHomeTextChannelIdMock.mockReset();
  setGuildHomeVoiceChannelIdMock.mockReset();
  setGuildDmRoleIdMock.mockReset();
  setGuildDefaultTalkModeMock.mockReset();
  upsertDmDisplayNameMemoryMock.mockReset();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("/meepo settings awakening params", () => {
  test("show includes awakening config, memory, and read-only fields", async () => {
    stubCoreEnv();
    const { meepo } = await import("../commands/meepo.js");
    const interaction = buildInteraction({ sub: "show" });

    await meepo.execute(interaction as any, { db: {}, campaignSlug: "default" } as any);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const payload = interaction.reply.mock.calls[0]?.[0] as { content: string; ephemeral: boolean };
    expect(payload.ephemeral).toBe(true);
    expect(payload.content).toContain("home_text_channel: <#text-1>");
    expect(payload.content).toContain("home_voice_channel: <#voice-1>");
    expect(payload.content).toContain("dm_role_id: <@&role-1>");
    expect(payload.content).toContain("dm_display_name (memory): Mina");
    expect(payload.content).toContain("dm_user_id (read-only): <@dm-user> (dm-user)");
    expect(payload.content).toContain("stt_prompt_current (read-only): Guild STT Prompt");
    expect(payload.content).toContain("awakened (read-only): true");
    expect(payload.content).toContain("default_talk_mode");
  });

  test("blocks edits for non-DM users", async () => {
    stubCoreEnv();
    const { meepo } = await import("../commands/meepo.js");
    const interaction = buildInteraction({
      sub: "home_text_channel",
      userId: "not-dm",
      hasManageGuild: false,
      channel: { id: "text-2", isTextBased: () => true, isVoiceBased: () => false },
    });

    await meepo.execute(interaction as any, { db: {}, campaignSlug: "default" } as any);

    expect(setGuildHomeTextChannelIdMock).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Only the Dungeon Master can edit awakening settings.",
      ephemeral: true,
    });
  });

  test("edits home text channel via guild config", async () => {
    stubCoreEnv();
    const { meepo } = await import("../commands/meepo.js");
    const interaction = buildInteraction({
      sub: "home_text_channel",
      userId: "dm-user",
      channel: { id: "text-9", isTextBased: () => true, isVoiceBased: () => false },
    });

    await meepo.execute(interaction as any, { db: {}, campaignSlug: "default" } as any);

    expect(setGuildHomeTextChannelIdMock).toHaveBeenCalledWith("guild-1", "text-9");
  });

  test("edits talk mode via guild config", async () => {
    stubCoreEnv();
    const { meepo } = await import("../commands/meepo.js");
    const interaction = buildInteraction({
      sub: "talk_mode",
      userId: "dm-user",
      mode: "talk",
    });

    await meepo.execute(interaction as any, { db: {}, campaignSlug: "default" } as any);

    expect(setGuildDefaultTalkModeMock).toHaveBeenCalledWith("guild-1", "talk");
  });

  test("edits dm_name in memory, not guild_config", async () => {
    stubCoreEnv();
    const { meepo } = await import("../commands/meepo.js");
    const interaction = buildInteraction({
      sub: "dm_name",
      userId: "dm-user",
      name: "  Minerva  ",
    });

    await meepo.execute(interaction as any, { db: {}, campaignSlug: "default" } as any);

    expect(upsertDmDisplayNameMemoryMock).toHaveBeenCalledWith({
      db: {},
      guildId: "guild-1",
      displayName: "Minerva",
      source: "settings_dm_name",
    });
    expect(setGuildDmRoleIdMock).not.toHaveBeenCalled();
  });
});
