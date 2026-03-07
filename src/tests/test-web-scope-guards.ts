import { describe, expect, it } from "vitest";
import { isCampaignSlugInScope, assertSessionScope } from "../../apps/web/lib/server/scopeGuards";

describe("web scope guards", () => {
  it("campaign scope helper denies cross-guild slug mismatch", () => {
    const inScope = isCampaignSlugInScope({
      requestedCampaignSlug: "other-campaign",
      resolvedCampaignSlug: "default",
    });

    expect(inScope).toBe(false);
  });

  it("session scope assertion rejects out-of-scope guild access", () => {
    expect(() =>
      assertSessionScope({
        authGuildId: "guild-a",
        sessionGuildId: "guild-b",
      })
    ).toThrowError(/out of scope/i);
  });
});
