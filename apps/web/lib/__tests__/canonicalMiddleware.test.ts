import { afterEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("web canonical middleware", () => {
  test("redirects meepo.online deep links to starstory.online and preserves query params", () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = new NextRequest("https://meepo.online/dashboard?tab=sessions", {
      headers: {
        host: "meepo.online",
      },
    });

    const response = middleware(request);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://starstory.online/dashboard?tab=sessions");
  });

  test("redirects www.starstory.online to the apex host", () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = new NextRequest("https://www.starstory.online/dashboard", {
      headers: {
        host: "www.starstory.online",
      },
    });

    const response = middleware(request);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://starstory.online/dashboard");
  });

  test("allows the canonical host through unchanged", () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = new NextRequest("https://starstory.online/dashboard", {
      headers: {
        host: "starstory.online",
      },
    });

    const response = middleware(request);

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });
});
