// @ts-nocheck
import { describe, expect, test } from "vitest";
import { buildCampaignSkyModel } from "../../apps/web/lib/starstory/domain/sky/campaignSkyMapper";

describe("campaign sky model builder", () => {
  test("builds nodes and links from campaigns with sessions", () => {
    const model = buildCampaignSkyModel({
      campaigns: [
        {
          id: "g1::alpha",
          slug: "alpha",
          name: "Alpha",
          sessionCount: 2,
          lastSessionDate: "2026-01-02",
          guildIconUrl: null,
          sessions: [
            { id: "a1", label: "A1", title: "A1", date: "2026-01-01" },
            { id: "a2", label: "A2", title: "A2", date: "2026-01-02" },
          ],
        },
        {
          id: "g1::beta",
          slug: "beta",
          name: "Beta",
          sessionCount: 1,
          lastSessionDate: "2026-01-03",
          guildIconUrl: null,
          sessions: [{ id: "b1", label: "B1", title: "B1", date: "2026-01-03" }],
        },
      ],
      personalAnchorStar: null,
    });

    expect(model.nodes.length).toBe(3);
    expect(model.links.length).toBe(1);
    expect(model.personalAnchorNode).toBeNull();
    expect(model.nodes.every((node) => node.x >= 0 && node.x <= 100)).toBe(true);
  });

  test("includes all sessions without truncation", () => {
    const sessions = Array.from({ length: 12 }, (_, index) => ({
      id: `s-${index + 1}`,
      label: `Session ${index + 1}`,
      title: `Session ${index + 1}`,
      date: `2026-02-${String((index % 28) + 1).padStart(2, "0")}`,
    }));

    const model = buildCampaignSkyModel({
      campaigns: [
        {
          id: "g1::omega",
          slug: "omega",
          name: "Omega",
          sessionCount: sessions.length,
          lastSessionDate: "2026-02-28",
          guildIconUrl: null,
          sessions,
        },
      ],
      personalAnchorStar: null,
    });

    expect(model.nodes.length).toBe(12);
    expect(model.links.length).toBe(model.nodes.length - 1);
    expect(model.contentHeight).toBeGreaterThan(0);
  });
});