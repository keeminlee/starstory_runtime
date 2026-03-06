import { afterEach, describe, expect, test, vi } from "vitest";

const stubLegacyCommand = {
  data: {
    toJSON: () => ({
      name: "stub",
      description: "stub",
      options: [{ type: 1, name: "run", description: "run", options: [] }],
    }),
  },
  execute: vi.fn(async () => {}),
};

vi.mock("../../commands/meepoLegacy.js", () => ({ meepo: stubLegacyCommand }));
vi.mock("../../commands/session.js", () => ({ session: stubLegacyCommand }));
vi.mock("../../commands/meeps.js", () => ({ meeps: stubLegacyCommand }));
vi.mock("../../commands/missions.js", () => ({ missions: stubLegacyCommand }));
vi.mock("../../commands/goldmem.js", () => ({ goldmem: stubLegacyCommand }));
vi.mock("../../commands/meepo.js", async () => {
  const actual = await vi.importActual<any>("../../commands/meepo.js");
  return {
    ...actual,
    executeLabAwakenRespond: vi.fn(async () => {}),
    executeLabDoctor: vi.fn(async () => {}),
    executeLabSleep: vi.fn(async () => {}),
  };
});

function stubCoreEnv(): void {
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("OPENAI_API_KEY", "test-openai");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("lab command gating", () => {
  test("runtime commandList includes /lab", async () => {
    stubCoreEnv();
    const { commandList } = await import("../../commands/index.js");
    const names = commandList.map((command: any) => command.data.name);
    expect(names).not.toContain("meeps");
    expect(names).not.toContain("missions");
    expect(names).not.toContain("goldmem");
    expect(names).toContain("lab");
  });

  test("global deploy list excludes /lab", async () => {
    stubCoreEnv();
    const { globalCommands } = await import("../../commands/index.js");
    const names = globalCommands.map((command: any) => command.data.name);
    expect(names).not.toContain("lab");
  });

  test("dev guild deploy list includes /lab and excludes /meepo", async () => {
    stubCoreEnv();
    const { devGuildCommands } = await import("../../commands/index.js");
    const names = devGuildCommands.map((command: any) => command.data.name);
    expect(names).toContain("lab");
    expect(names).not.toContain("meepo");
  });
});
