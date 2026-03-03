import { afterEach, describe, expect, test, vi } from "vitest";

function stubCoreEnv(): void {
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("OPENAI_API_KEY", "test-openai");
}

let canonMode: "diegetic" | "meta" | null = "meta";
let canonPersonaId: string | null = "rei";
let setupVersion = 1;

vi.mock("../campaign/guildConfig.js", () => ({
  getGuildCanonPersonaMode: vi.fn(() => canonMode),
  getGuildCanonPersonaId: vi.fn(() => canonPersonaId),
  getGuildSetupVersion: vi.fn(() => setupVersion),
  resolveCampaignSlug: vi.fn(() => "default"),
}));

vi.mock("../sessions/sessionRuntime.js", () => ({
  resolveEffectiveMode: vi.fn(() => "canon"),
  getConfiguredDiegeticPersonaId: vi.fn(() => "rei"),
  getActiveSessionId: vi.fn(() => "session-1"),
}));

vi.mock("../db.js", () => ({
  getDbForCampaign: vi.fn(() => ({
    prepare: vi.fn(() => ({ get: vi.fn(() => ({ active_persona_id: "meta_meepo" })), run: vi.fn() })),
  })),
}));

vi.mock("../personas/index.js", () => ({
  getPersona: vi.fn(() => ({ scope: "meta" })),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  canonMode = "meta";
  canonPersonaId = "rei";
  setupVersion = 1;
  vi.clearAllMocks();
  vi.resetModules();
});

describe("canon persona mode resolution", () => {
  test("canon mode meta resolves to meta_meepo", async () => {
    stubCoreEnv();
    const { getEffectivePersonaId } = await import("../meepo/personaState.js");
    expect(getEffectivePersonaId("guild-1")).toBe("meta_meepo");
  });

  test("canon mode diegetic resolves configured canon persona", async () => {
    stubCoreEnv();
    canonMode = "diegetic";
    canonPersonaId = "rei";
    const { getEffectivePersonaId } = await import("../meepo/personaState.js");
    expect(getEffectivePersonaId("guild-1")).toBe("rei");
  });

  test("runtime fallback allowed only before setup_version 1", async () => {
    stubCoreEnv();
    canonMode = "diegetic";
    canonPersonaId = null;
    setupVersion = 0;
    const { getEffectivePersonaId } = await import("../meepo/personaState.js");
    expect(getEffectivePersonaId("guild-1")).toBe("rei");

    setupVersion = 1;
    vi.resetModules();
    const { getEffectivePersonaId: getEffectivePersonaIdAfterSetup } = await import("../meepo/personaState.js");
    expect(getEffectivePersonaIdAfterSetup("guild-1")).toBe("diegetic_meepo");
  });
});
