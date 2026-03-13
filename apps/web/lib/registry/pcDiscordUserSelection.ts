import type { SeenDiscordUserOption } from "@/lib/registry/types";

export const NO_KNOWN_USERS_HELPER_TEXT =
  "No Discord users have been observed in this campaign yet. Run a session first to populate this list.";

export const UNKNOWN_STORED_MAPPING_LABEL = "Unknown user (stored mapping)";

export type PlayedBySelectOption = {
  value: string;
  label: string;
};

export type PcDiscordUserSelectionModel = {
  options: PlayedBySelectOption[];
  initialValue: string;
  helperText: string | null;
  saveBlockedByEmptyState: boolean;
};

export function formatSeenDiscordUserLabel(user: SeenDiscordUserOption): string {
  const nickname = user.nickname.trim();
  const username = user.username?.trim();
  if (!username) {
    return nickname;
  }

  if (nickname.localeCompare(username, undefined, { sensitivity: "accent" }) === 0) {
    return nickname;
  }

  return `${nickname} (@${username})`;
}

export function buildPcDiscordUserSelectionModel(args: {
  knownUsers: SeenDiscordUserOption[];
  currentDiscordUserId?: string | null;
  requireRemapLabel?: boolean;
}): PcDiscordUserSelectionModel {
  const knownUsers = args.knownUsers;
  const currentDiscordUserId = args.currentDiscordUserId?.trim() || null;
  const matchingUser = currentDiscordUserId
    ? knownUsers.find((user) => user.discordUserId === currentDiscordUserId) ?? null
    : null;

  const baseOptions = knownUsers.map((user) => ({
    value: user.discordUserId,
    label: formatSeenDiscordUserLabel(user),
  }));

  if (!currentDiscordUserId) {
    return {
      options: [{ value: "", label: "Select a Discord user" }, ...baseOptions],
      initialValue: "",
      helperText: knownUsers.length === 0 ? NO_KNOWN_USERS_HELPER_TEXT : null,
      saveBlockedByEmptyState: knownUsers.length === 0,
    };
  }

  if (matchingUser) {
    return {
      options: [{ value: "", label: "Select a Discord user" }, ...baseOptions],
      initialValue: currentDiscordUserId,
      helperText: null,
      saveBlockedByEmptyState: false,
    };
  }

  return {
    options: [{ value: "", label: UNKNOWN_STORED_MAPPING_LABEL }, ...baseOptions],
    initialValue: "",
    helperText:
      knownUsers.length === 0
        ? NO_KNOWN_USERS_HELPER_TEXT
        : "Stored mapping is no longer in the known-user list. Choose a current Discord user before saving.",
    saveBlockedByEmptyState: knownUsers.length === 0,
  };
}