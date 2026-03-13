// @ts-nocheck
import React from "../../apps/web/node_modules/react/index.js";
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "../../apps/web/node_modules/react-dom/server.js";
import { CampaignRegistryManager } from "../../apps/web/components/campaign/campaign-registry-manager";
import {
  buildPcDiscordUserSelectionModel,
  formatSeenDiscordUserLabel,
  NO_KNOWN_USERS_HELPER_TEXT,
  UNKNOWN_STORED_MAPPING_LABEL,
} from "../../apps/web/lib/registry/pcDiscordUserSelection";

function makeRegistry(overrides?: Partial<Parameters<typeof CampaignRegistryManager>[0]["initialRegistry"]>) {
  return {
    campaignSlug: "alpha",
    categories: {
      pcs: [],
      npcs: [],
      locations: [],
      factions: [],
      misc: [],
    },
    ignoreTokens: [],
    pending: {
      generatedAt: null,
      sourceCampaignSlug: null,
      sourceGuildId: null,
      items: [],
    },
    ...overrides,
  };
}

describe("CampaignRegistryManager PC discord-user UI", () => {
  test("builds known-user dropdown options with recognition-first labels", () => {
    const user = { discordUserId: "user-1", nickname: "Rowan", username: "rowan_dm" };
    const selection = buildPcDiscordUserSelectionModel({ knownUsers: [user] });

    expect(formatSeenDiscordUserLabel(user)).toBe("Rowan (@rowan_dm)");
    expect(selection.options).toEqual([
      { value: "", label: "Select a Discord user" },
      { value: "user-1", label: "Rowan (@rowan_dm)" },
    ]);
  });

  test("exposes explicit empty-state helper when no known users exist", () => {
    const selection = buildPcDiscordUserSelectionModel({ knownUsers: [] });

    expect(selection.helperText).toBe(NO_KNOWN_USERS_HELPER_TEXT);
    expect(selection.saveBlockedByEmptyState).toBe(true);
  });

  test("renders legacy stale mapping fallback label", () => {
    const html = renderToStaticMarkup(
      <CampaignRegistryManager
        campaignSlug="alpha"
        guildId="guild-1"
        initialRegistry={makeRegistry({
          categories: {
            pcs: [
              {
                id: "pc_legacy",
                canonicalName: "Legacy PC",
                aliases: [],
                notes: "",
                category: "pcs",
                discordUserId: "missing-user",
              },
            ],
            npcs: [],
            locations: [],
            factions: [],
            misc: [],
          },
        })}
        initialSeenDiscordUsers={[
          { discordUserId: "user-1", nickname: "Rowan", username: null },
        ]}
        isEditable
      />
    );

    expect(html).toContain(UNKNOWN_STORED_MAPPING_LABEL);
  });
});