import { describe, expect, test } from "vitest";
import { overlayChronicleText } from "@/lib/chronicle/recapEntityOverlay";
import type { EntityCandidateDto, RegistrySnapshotDto } from "@/lib/registry/types";

function buildRegistry(): RegistrySnapshotDto {
  return {
    campaignSlug: "alpha",
    ignoreTokens: [],
    pending: {
      generatedAt: null,
      sourceCampaignSlug: null,
      sourceGuildId: null,
      items: [],
    },
    categories: {
      pcs: [
        {
          id: "pc-ice-prince",
          canonicalName: "Ice Prince",
          aliases: ["The Prince"],
          notes: "",
          category: "pcs",
          discordUserId: null,
        },
      ],
      npcs: [
        {
          id: "npc-umo",
          canonicalName: "Umo",
          aliases: ["Archivist Umo"],
          notes: "",
          category: "npcs",
          discordUserId: null,
        },
      ],
      locations: [],
      factions: [],
      misc: [],
    },
  };
}

function unresolvedCandidate(candidateName: string): EntityCandidateDto {
  return {
    candidateName,
    mentions: 1,
    examples: [],
    possibleMatches: [],
    resolution: null,
  };
}

describe("overlayChronicleText", () => {
  test("matches canonical entities before unresolved candidates", () => {
    const spans = overlayChronicleText({
      text: "Ice Prince stepped forward.",
      registry: buildRegistry(),
      candidates: [unresolvedCandidate("Ice Prince")],
    });

    expect(spans).toEqual([
      { type: "entity", text: "Ice Prince", entityId: "pc-ice-prince", category: "pcs" },
      { type: "text", text: " stepped forward." },
    ]);
  });

  test("matches canonical aliases exactly when casing and boundaries line up", () => {
    const spans = overlayChronicleText({
      text: "The Prince vanished into the fog.",
      registry: buildRegistry(),
    });

    expect(spans).toEqual([
      { type: "entity", text: "The Prince", entityId: "pc-ice-prince", category: "pcs" },
      { type: "text", text: " vanished into the fog." },
    ]);
  });

  test("does not match unresolved candidates inside larger words", () => {
    const spans = overlayChronicleText({
      text: "She replied humorously and kept walking.",
      candidates: [unresolvedCandidate("Umo")],
    });

    expect(spans).toEqual([{ type: "text", text: "She replied humorously and kept walking." }]);
  });

  test("requires exact casing for candidate matches", () => {
    const spans = overlayChronicleText({
      text: "umo arrived late.",
      candidates: [unresolvedCandidate("Umo")],
    });

    expect(spans).toEqual([{ type: "text", text: "umo arrived late." }]);
  });

  test("matches candidates as exact contiguous phrases with punctuation boundaries", () => {
    const spans = overlayChronicleText({
      text: '"Ice Warden," Mira warned.',
      candidates: [unresolvedCandidate("Ice Warden")],
    });

    expect(spans).toEqual([
      { type: "text", text: '"' },
      { type: "candidate", text: "Ice Warden", candidateName: "Ice Warden" },
      { type: "text", text: '," Mira warned.' },
    ]);
  });
});