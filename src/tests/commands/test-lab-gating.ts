import { afterEach, describe, expect, test, vi } from "vitest";

function stubCoreEnv(): void {
  vi.stubEnv("DISCORD_TOKEN", "test-token");
  vi.stubEnv("OPENAI_API_KEY", "test-openai");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("lab command gating", () => {
  test("commandList excludes /lab by default", async () => {
    stubCoreEnv();
    const { commandList } = await import("../../commands/index.js");
    const names = commandList.map((command: any) => command.data.name);
    expect(names).not.toContain("lab");
  });

  test("commandList includes /lab when ENABLE_LAB_COMMANDS=true", async () => {
    stubCoreEnv();
    vi.stubEnv("ENABLE_LAB_COMMANDS", "true");
    const { commandList } = await import("../../commands/index.js");
    const names = commandList.map((command: any) => command.data.name);
    expect(names).toContain("lab");
  });
});
