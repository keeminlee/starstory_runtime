import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildEnvStartupDiagnostics, initializeEnvPolicy } from "../config/envPolicy.js";

const tempDirs: string[] = [];

function makeTempRepo(): { repoRoot: string; webRoot: string } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meepo-env-policy-"));
  tempDirs.push(repoRoot);
  const webRoot = path.join(repoRoot, "apps", "web");
  fs.mkdirSync(webRoot, { recursive: true });
  return { repoRoot, webRoot };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore transient Windows cleanup failures.
    }
  }
});

describe("env policy", () => {
  test("development mode loads dotenv files without overriding host env", () => {
    const { repoRoot, webRoot } = makeTempRepo();
    fs.writeFileSync(path.join(repoRoot, ".env.local"), "OPENAI_API_KEY=stale-local\nANTHROPIC_API_KEY=anthropic-local\n", "utf8");

    const env = {
      NODE_ENV: "development",
      OPENAI_API_KEY: "host-openai-key",
    } as NodeJS.ProcessEnv;

    const snapshot = initializeEnvPolicy({
      consumer: "runtime",
      mode: "development-dotenv",
      env,
      cwd: repoRoot,
      repoRoot,
      webRoot,
      forceReload: true,
    });

    expect(snapshot.loadedFiles).toContain(".env.local");
    expect(env.OPENAI_API_KEY).toBe("host-openai-key");
    expect(env.ANTHROPIC_API_KEY).toBe("anthropic-local");
  });

  test("production host mode rejects forbidden dotenv files", () => {
    const { repoRoot, webRoot } = makeTempRepo();
    fs.writeFileSync(path.join(webRoot, ".env.local"), "OPENAI_API_KEY=stale-local\n", "utf8");

    expect(() =>
      initializeEnvPolicy({
        consumer: "web",
        mode: "production-host",
        env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
        cwd: webRoot,
        repoRoot,
        webRoot,
        forceReload: true,
      })
    ).toThrow(/Production host mode forbids repo-local dotenv files/);
  });

  test("test hermetic mode ignores dotenv files", () => {
    const { repoRoot, webRoot } = makeTempRepo();
    fs.writeFileSync(path.join(repoRoot, ".env"), "OPENAI_API_KEY=from-dotenv\n", "utf8");

    const env = {
      NODE_ENV: "test",
      OPENAI_API_KEY: "test-openai-key",
    } as NodeJS.ProcessEnv;

    const snapshot = initializeEnvPolicy({
      consumer: "runtime",
      mode: "test-hermetic",
      env,
      cwd: repoRoot,
      repoRoot,
      webRoot,
      forceReload: true,
    });

    expect(snapshot.ignoredFiles).toContain(".env");
    expect(snapshot.loadedFiles).toEqual([]);
    expect(env.OPENAI_API_KEY).toBe("test-openai-key");
  });

  test("startup diagnostics expose fingerprints without leaking full secrets", () => {
    const { repoRoot, webRoot } = makeTempRepo();
    const secret = "sk-production-secret-1234";
    initializeEnvPolicy({
      consumer: "runtime",
      mode: "development-dotenv",
      env: {
        NODE_ENV: "development",
        DISCORD_TOKEN: "discord-secret-7777",
        OPENAI_API_KEY: secret,
      } as NodeJS.ProcessEnv,
      cwd: repoRoot,
      repoRoot,
      webRoot,
      forceReload: true,
    });

    const diagnostics = buildEnvStartupDiagnostics({ llmProvider: "openai" });
    const serialized = JSON.stringify(diagnostics);

    expect(diagnostics.key_state.OPENAI_API_KEY.present).toBe(true);
    expect(diagnostics.key_state.OPENAI_API_KEY.suffix).toBe("1234");
    expect(diagnostics.key_state.OPENAI_API_KEY.fingerprint).toHaveLength(8);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("discord-secret-7777");
  });
});