import {
  loadState,
  saveProgress,
  type GuildOnboardingState,
} from "../ledger/awakeningStateRepo.js";
import type { AwakenScript, Scene } from "../scripts/awakening/_schema.js";
import { getGuildMemoryByKey } from "../meepoMind/meepoMindMemoryRepo.js";
import { DM_DISPLAY_NAME_KEY, upsertDmDisplayNameMemory } from "../meepoMind/meepoMindWriter.js";

export const AWAKEN_AWAIT_INPUT_KEY = "await_input";
export const AWAKEN_PENDING_PROMPT_KIND_KEY = "pending_prompt_kind";
export const AWAKEN_PENDING_PROMPT_KEY_KEY = "pending_prompt_key";
export const AWAKEN_PENDING_PROMPT_SCENE_ID_KEY = "pending_prompt_scene_id";
export const AWAKEN_PENDING_PROMPT_NONCE_KEY = "pending_prompt_nonce";
export const AWAKEN_PENDING_PROMPT_CREATED_AT_MS_KEY = "pending_prompt_created_at_ms";

type AwaitInputSpec = {
  key: string;
  kind: string;
};

export type PendingPromptState = {
  key: string;
  kind: string;
  sceneId: string;
  nonce: string;
  createdAtMs?: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveAwaitInputFromScene(scene: Scene): AwaitInputSpec | null {
  if (!scene.prompt || !isObject(scene.prompt)) {
    return null;
  }

  const key = typeof scene.prompt.key === "string"
    ? scene.prompt.key.trim()
    : typeof scene.prompt.type === "string"
      ? scene.prompt.type.trim()
      : "";

  if (!key) {
    return null;
  }

  const kind = typeof scene.prompt.kind === "string" && scene.prompt.kind.trim().length > 0
    ? scene.prompt.kind.trim()
    : typeof scene.prompt.type === "string" && scene.prompt.type.trim().length > 0
      ? scene.prompt.type.trim()
      : "modal_text";

  return { key, kind };
}

export function getPendingPromptFromState(state: GuildOnboardingState | null): PendingPromptState | null {
  if (!state) return null;
  const kind = state.progress_json[AWAKEN_PENDING_PROMPT_KIND_KEY];
  const key = state.progress_json[AWAKEN_PENDING_PROMPT_KEY_KEY];
  const sceneId = state.progress_json[AWAKEN_PENDING_PROMPT_SCENE_ID_KEY];
  const nonce = state.progress_json[AWAKEN_PENDING_PROMPT_NONCE_KEY];
  const createdAtMs = state.progress_json[AWAKEN_PENDING_PROMPT_CREATED_AT_MS_KEY];

  if (typeof kind !== "string" || typeof key !== "string" || typeof sceneId !== "string" || typeof nonce !== "string") {
    return null;
  }

  return {
    kind,
    key,
    sceneId,
    nonce,
    createdAtMs: typeof createdAtMs === "number" ? createdAtMs : undefined,
  };
}

export function buildPendingPromptPatch(pending: PendingPromptState): Record<string, unknown> {
  return {
    [AWAKEN_AWAIT_INPUT_KEY]: {
      key: pending.key,
      kind: pending.kind,
    },
    [AWAKEN_PENDING_PROMPT_KIND_KEY]: pending.kind,
    [AWAKEN_PENDING_PROMPT_KEY_KEY]: pending.key,
    [AWAKEN_PENDING_PROMPT_SCENE_ID_KEY]: pending.sceneId,
    [AWAKEN_PENDING_PROMPT_NONCE_KEY]: pending.nonce,
    [AWAKEN_PENDING_PROMPT_CREATED_AT_MS_KEY]: pending.createdAtMs ?? Date.now(),
  };
}

export function clearPendingPromptPatch(): Record<string, unknown> {
  return {
    [AWAKEN_AWAIT_INPUT_KEY]: null,
    [AWAKEN_PENDING_PROMPT_KIND_KEY]: null,
    [AWAKEN_PENDING_PROMPT_KEY_KEY]: null,
    [AWAKEN_PENDING_PROMPT_SCENE_ID_KEY]: null,
    [AWAKEN_PENDING_PROMPT_NONCE_KEY]: null,
    [AWAKEN_PENDING_PROMPT_CREATED_AT_MS_KEY]: null,
  };
}

export function resolveModalTextFallback(text: string): string {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error("modal_text response cannot be empty");
  }
  return normalized;
}

export function getAwaitInputFromState(state: GuildOnboardingState | null): AwaitInputSpec | null {
  if (!state) return null;

  const raw = state.progress_json[AWAKEN_AWAIT_INPUT_KEY];
  if (!isObject(raw)) return null;

  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  const kind = typeof raw.kind === "string" ? raw.kind.trim() : "";

  if (!key || !kind) return null;
  return { key, kind };
}

function getDmDisplayNameFromProgress(state: GuildOnboardingState | null): string | null {
  if (!state) return null;
  const raw = state.progress_json[DM_DISPLAY_NAME_KEY];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function repairDmDisplayNameMemory(args: {
  db: any;
  guildId: string;
  scriptId: string;
}): { repaired: boolean; displayName: string | null } {
  const state = loadState(args.guildId, args.scriptId, { db: args.db });
  const displayName = getDmDisplayNameFromProgress(state);
  if (!displayName) {
    return { repaired: false, displayName: null };
  }

  const existing = getGuildMemoryByKey({
    db: args.db,
    guildId: args.guildId,
    key: DM_DISPLAY_NAME_KEY,
  });

  if (existing && existing.text.trim().length > 0) {
    return { repaired: false, displayName };
  }

  upsertDmDisplayNameMemory({
    db: args.db,
    guildId: args.guildId,
    displayName,
    source: "awakening_repair",
  });

  return { repaired: true, displayName };
}

export function acceptDmDisplayNameResponse(args: {
  db: any;
  guildId: string;
  script: AwakenScript;
  responseText: string;
}): GuildOnboardingState {
  const responseText = resolveModalTextFallback(args.responseText);

  const state = loadState(args.guildId, args.script.id, { db: args.db });
  if (!state) {
    throw new Error("No onboarding state found");
  }

  const awaitInput = getAwaitInputFromState(state);
  const pending = getPendingPromptFromState(state);
  if (
    !awaitInput
    || awaitInput.key !== DM_DISPLAY_NAME_KEY
    || awaitInput.kind !== "modal_text"
    || (pending != null && (pending.key !== DM_DISPLAY_NAME_KEY || pending.kind !== "modal_text"))
  ) {
    throw new Error("No pending dm_display_name prompt");
  }

  const updated = saveProgress(args.guildId, args.script.id, {
    [awaitInput.key]: responseText,
    ...clearPendingPromptPatch(),
  }, { db: args.db });

  return updated;
}
