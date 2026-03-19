import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("web auth origin guard", () => {
  test("accepts the canonical starstory origin in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("NEXTAUTH_URL", "https://starstory.online");
    vi.stubEnv("AUTH_URL", "https://starstory.online");

    const { assertProductionAuthEnvironment } = await import("@/lib/server/authOptions");

    expect(() => assertProductionAuthEnvironment()).not.toThrow();
  });

  test("rejects the legacy meepo.online origin in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("NEXTAUTH_URL", "https://meepo.online");
    vi.stubEnv("AUTH_URL", "https://meepo.online");

    const { assertProductionAuthEnvironment } = await import("@/lib/server/authOptions");

    expect(() => assertProductionAuthEnvironment()).toThrowError(
      "NEXTAUTH_URL must be https://starstory.online in production.",
    );
  });
});
