import { describe, expect, test, vi } from "vitest";
import { loadRegistryForScope } from "../registry/loadRegistry.js";

vi.mock("../db.js", () => ({
  getDbForCampaign: vi.fn(() => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
    })),
  })),
}));

describe("runtime scope helpers", () => {
  test("loadRegistryForScope refuses missing scope values", () => {
    expect(() => loadRegistryForScope({ guildId: "", campaignSlug: "default" } as any)).toThrow(
      /explicit guildId and campaignSlug/i
    );
    expect(() => loadRegistryForScope({ guildId: "guild-1", campaignSlug: "" } as any)).toThrow(
      /explicit guildId and campaignSlug/i
    );
  });

  test("searchEventsByTitleScoped refuses missing scope values", async () => {
    // Dynamic import ensures the db mock is installed first.
    const { searchEventsByTitleScoped } = await import("../ledger/eventSearch.js");

    expect(() =>
      searchEventsByTitleScoped({
        term: "bridge",
        scope: { guildId: "", campaignSlug: "default" } as any,
      })
    ).toThrow(/explicit scope/i);

    expect(() =>
      searchEventsByTitleScoped({
        term: "bridge",
        scope: { guildId: "guild-1", campaignSlug: "" } as any,
      })
    ).toThrow(/explicit scope/i);
  });
});
