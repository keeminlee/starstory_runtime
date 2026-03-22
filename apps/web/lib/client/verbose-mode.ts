export type VerboseModePreferences = {
  verboseModeEnabled: boolean;
};

export const VERBOSE_MODE_STORAGE_KEY = "meepo.web.verbose-mode";

export const DEFAULT_VERBOSE_MODE_PREFERENCES: VerboseModePreferences = {
  verboseModeEnabled: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseVerboseModePreferences(input: unknown): VerboseModePreferences {
  if (!isRecord(input)) {
    return DEFAULT_VERBOSE_MODE_PREFERENCES;
  }

  return {
    verboseModeEnabled:
      typeof input.verboseModeEnabled === "boolean"
        ? input.verboseModeEnabled
        : DEFAULT_VERBOSE_MODE_PREFERENCES.verboseModeEnabled,
  };
}

export function readVerboseModePreferences(
  storage: Pick<Storage, "getItem">
): VerboseModePreferences {
  try {
    const raw = storage.getItem(VERBOSE_MODE_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_VERBOSE_MODE_PREFERENCES;
    }

    return parseVerboseModePreferences(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_VERBOSE_MODE_PREFERENCES;
  }
}

export function writeVerboseModePreferences(
  storage: Pick<Storage, "setItem">,
  preferences: VerboseModePreferences
): void {
  try {
    storage.setItem(VERBOSE_MODE_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore local storage write failures and keep the in-memory toggle active.
  }
}