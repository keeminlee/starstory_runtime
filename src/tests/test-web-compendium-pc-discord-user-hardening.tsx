// @ts-nocheck
import { describe, expect, test } from "vitest";
import {
  buildPcDiscordUserSelectionModel,
  formatSeenDiscordUserLabel,
  NO_KNOWN_USERS_HELPER_TEXT,
  UNKNOWN_STORED_MAPPING_LABEL,
} from "../../apps/web/lib/registry/pcDiscordUserSelection";

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

  test("uses fallback label for legacy stale mappings", () => {
    const selection = buildPcDiscordUserSelectionModel({
      knownUsers: [{ discordUserId: "user-1", nickname: "Rowan", username: null }],
      currentDiscordUserId: "missing-user",
    });

    expect(selection.options[0]?.label).toBe(UNKNOWN_STORED_MAPPING_LABEL);
    expect(selection.initialValue).toBe("");
    expect(selection.helperText).toContain("Stored mapping is no longer in the known-user list");
  });
});