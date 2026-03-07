import { describe, expect, it } from "vitest";
import { resolveWebAuthContextFromInputs, WebAuthError } from "../../apps/web/lib/server/authContext";

describe("web auth context guard", () => {
  it("rejects query override when bypass gate is disabled", () => {
    expect(() =>
      resolveWebAuthContextFromInputs({
        headerGuild: null,
        searchParams: { guildId: "guild-test" },
        envGuild: null,
        bypassFlag: "0",
        nodeEnv: "development",
      })
    ).toThrow(WebAuthError);
  });

  it("allows query override only in development with bypass gate", () => {
    const context = resolveWebAuthContextFromInputs({
      headerGuild: null,
      searchParams: { guildId: "guild-dev" },
      envGuild: null,
      bypassFlag: "1",
      nodeEnv: "development",
    });

    expect(context.guildId).toBe("guild-dev");
    expect(context.source).toBe("query");
    expect(context.devBypass).toBe(true);
  });

  it("rejects header override in production even when bypass flag is set", () => {
    expect(() =>
      resolveWebAuthContextFromInputs({
        headerGuild: "guild-prod",
        searchParams: {},
        envGuild: "guild-env",
        bypassFlag: "1",
        nodeEnv: "production",
      })
    ).toThrow(WebAuthError);
  });
});
