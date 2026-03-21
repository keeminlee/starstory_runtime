import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore transient cleanup failures.
    }
  }
});

describe("deploy command env bootstrap", () => {
  test("loads bot env file before command manifest import", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-deploy-env-"));
    tempDirs.push(tempDir);

    const botEnvFile = path.join(tempDir, "meepo-bot.env");
    fs.writeFileSync(
      botEnvFile,
      [
        "DISCORD_TOKEN=discord-test-token",
        "DISCORD_CLIENT_ID=discord-client-id",
      ].join("\n"),
      "utf8"
    );

    vi.stubEnv("DISCORD_TOKEN", "");
    vi.stubEnv("DISCORD_CLIENT_ID", "");

    const { bootstrapDeployEnv } = await import("../commands/deploy-commands.js");
    bootstrapDeployEnv([botEnvFile]);

    expect(process.env.DISCORD_TOKEN).toBe("discord-test-token");
    expect(process.env.DISCORD_CLIENT_ID).toBe("discord-client-id");
  });
});