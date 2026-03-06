export type BeatKind = "flavor" | "voice" | "system";
export type BeatVisibility = "public" | "ephemeral";

export interface Beat {
  text: string;
  delay_ms?: number;
  kind?: BeatKind;
  visibility?: BeatVisibility;
}

export interface PromptSpec {
  type: string;
  [key: string]: unknown;
}

export interface ActionSpec {
  type: string;
  [key: string]: unknown;
}

export type CommitSpec =
  | {
      type: "set_guild_config";
      key: string;
      value?: unknown;
      from?: string;
    }
  | {
      type: "set_flag";
      key: string;
      value?: unknown;
      from?: string;
    }
  | {
      type: "write_memory";
      memory_key: string;
      scope?: "guild";
      sticky?: boolean;
      value?: unknown;
      from?: string;
    }
  | {
      type: "append_registry_yaml";
      target: "pcs";
      entries_from: string;
      mode?: "append_only";
    };

export type NextSceneRef = {
  type: "scene";
  id: string;
};

export type NextSpec = NextSceneRef | {
  type: string;
  [key: string]: unknown;
};

export type SceneSay = string | Beat | Beat[];

export type ChannelDriftMiniScene = {
  channel: string;
  say?: SceneSay;
};

export type ChannelOnChangeSpec = {
  if_different_channel: {
    departure: ChannelDriftMiniScene;
    arrival: ChannelDriftMiniScene;
  };
};

export interface Scene {
  say?: SceneSay;
  prompt?: PromptSpec;
  action?: ActionSpec;
  commit?: CommitSpec[];
  requires?: string[];
  fallback_next?: string;
  on_change?: ChannelOnChangeSpec;
  next?: string | NextSpec;
}

export interface AwakenScript {
  id: string;
  version: number;
  start_scene: string;
  scenes: Record<string, Scene>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asPositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function validateBeat(value: unknown, path: string): Beat {
  if (!isObject(value)) {
    throw new Error(`${path} must be an object`);
  }
  if (typeof value.text !== "string" || value.text.length === 0) {
    throw new Error(`${path}.text must be a non-empty string`);
  }
  if (value.delay_ms !== undefined) {
    const delay = asPositiveInt(value.delay_ms);
    if (delay === null || delay < 0) {
      throw new Error(`${path}.delay_ms must be an integer >= 0`);
    }
  }
  if (value.kind !== undefined && value.kind !== "flavor" && value.kind !== "voice" && value.kind !== "system") {
    throw new Error(`${path}.kind must be one of flavor|voice|system`);
  }
  if (value.visibility !== undefined && value.visibility !== "public" && value.visibility !== "ephemeral") {
    throw new Error(`${path}.visibility must be one of public|ephemeral`);
  }
  return {
    text: value.text,
    delay_ms: value.delay_ms as number | undefined,
    kind: value.kind as BeatKind | undefined,
    visibility: value.visibility as BeatVisibility | undefined,
  };
}

function validateTypeObject(value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) {
    throw new Error(`${path} must be an object`);
  }
  if (typeof value.type !== "string" || value.type.length === 0) {
    throw new Error(`${path}.type must be a non-empty string`);
  }
  return value;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validateCommit(value: unknown, path: string): CommitSpec {
  const typed = validateTypeObject(value, path);
  const type = typed.type;

  if (type === "set_guild_config") {
    if (typeof typed.key !== "string" || typed.key.trim().length === 0) {
      throw new Error(`${path}.key must be a non-empty string`);
    }
    const hasValue = hasOwn(typed, "value");
    const hasFrom = hasOwn(typed, "from");
    if ((hasValue && hasFrom) || (!hasValue && !hasFrom)) {
      throw new Error(`${path} must include exactly one of value or from`);
    }
    if (hasFrom && (typeof typed.from !== "string" || typed.from.trim().length === 0)) {
      throw new Error(`${path}.from must be a non-empty string`);
    }
    return typed as CommitSpec;
  }

  if (type === "set_flag") {
    if (typeof typed.key !== "string" || typed.key.trim().length === 0) {
      throw new Error(`${path}.key must be a non-empty string`);
    }
    const hasValue = hasOwn(typed, "value");
    const hasFrom = hasOwn(typed, "from");
    if ((hasValue && hasFrom) || (!hasValue && !hasFrom)) {
      throw new Error(`${path} must include exactly one of value or from`);
    }
    if (hasFrom && (typeof typed.from !== "string" || typed.from.trim().length === 0)) {
      throw new Error(`${path}.from must be a non-empty string`);
    }
    return typed as CommitSpec;
  }

  if (type === "write_memory") {
    if (typeof typed.memory_key !== "string" || typed.memory_key.trim().length === 0) {
      throw new Error(`${path}.memory_key must be a non-empty string`);
    }
    if (typed.scope !== undefined && typed.scope !== "guild") {
      throw new Error(`${path}.scope supports only guild`);
    }
    if (typed.sticky !== undefined && typeof typed.sticky !== "boolean") {
      throw new Error(`${path}.sticky must be boolean when provided`);
    }
    const hasValue = hasOwn(typed, "value");
    const hasFrom = hasOwn(typed, "from");
    if ((hasValue && hasFrom) || (!hasValue && !hasFrom)) {
      throw new Error(`${path} must include exactly one of value or from`);
    }
    if (hasFrom && (typeof typed.from !== "string" || typed.from.trim().length === 0)) {
      throw new Error(`${path}.from must be a non-empty string`);
    }
    return typed as CommitSpec;
  }

  if (type === "append_registry_yaml") {
    if (typed.target !== "pcs") {
      throw new Error(`${path}.target must be pcs`);
    }
    if (typeof typed.entries_from !== "string" || typed.entries_from.trim().length === 0) {
      throw new Error(`${path}.entries_from must be a non-empty string`);
    }
    if (typed.mode !== undefined && typed.mode !== "append_only") {
      throw new Error(`${path}.mode must be append_only when provided`);
    }
    return typed as CommitSpec;
  }

  throw new Error(`${path}.type is unsupported: ${String(type)}`);
}

function validateSay(value: unknown, path: string): SceneSay {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => validateBeat(item, `${path}[${index}]`));
  }

  return validateBeat(value, path);
}

function validateChannelDriftMiniScene(value: unknown, path: string): ChannelDriftMiniScene {
  if (!isObject(value)) {
    throw new Error(`${path} must be an object`);
  }
  if (typeof value.channel !== "string" || value.channel.trim().length === 0) {
    throw new Error(`${path}.channel must be a non-empty string`);
  }

  const out: ChannelDriftMiniScene = {
    channel: value.channel,
  };

  if (value.say !== undefined) {
    out.say = validateSay(value.say, `${path}.say`);
  }

  return out;
}

function validateOnChange(value: unknown, path: string): ChannelOnChangeSpec {
  if (!isObject(value)) {
    throw new Error(`${path} must be an object`);
  }
  if (!isObject(value.if_different_channel)) {
    throw new Error(`${path}.if_different_channel must be an object`);
  }

  const ifDifferent = value.if_different_channel as Record<string, unknown>;
  return {
    if_different_channel: {
      departure: validateChannelDriftMiniScene(ifDifferent.departure, `${path}.if_different_channel.departure`),
      arrival: validateChannelDriftMiniScene(ifDifferent.arrival, `${path}.if_different_channel.arrival`),
    },
  };
}

function resolveDirectNextTarget(next: string | NextSpec | undefined, path: string): string | null {
  if (next === undefined) {
    return null;
  }

  if (typeof next === "string") {
    if (next.length === 0) {
      throw new Error(`${path} must not be empty`);
    }
    return next;
  }

  const typed = validateTypeObject(next, path);
  if (typed.type === "scene") {
    if (typeof typed.id !== "string" || typed.id.length === 0) {
      throw new Error(`${path}.id must be a non-empty string when type is \"scene\"`);
    }
    return typed.id;
  }

  return null;
}

export function validateAwakenScript(input: unknown): AwakenScript {
  if (!isObject(input)) {
    throw new Error(`script must be an object`);
  }

  const { id, version, start_scene, scenes } = input;

  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`id must be a non-empty string`);
  }

  const versionInt = asPositiveInt(version);
  if (versionInt === null || versionInt < 1) {
    throw new Error(`version must be an integer >= 1`);
  }

  if (typeof start_scene !== "string" || start_scene.length === 0) {
    throw new Error(`start_scene must be a non-empty string`);
  }

  if (!isObject(scenes)) {
    throw new Error(`scenes must be an object`);
  }

  const sceneMap: Record<string, Scene> = {};
  for (const [sceneId, sceneRaw] of Object.entries(scenes)) {
    if (!isObject(sceneRaw)) {
      throw new Error(`scenes.${sceneId} must be an object`);
    }

    const scene: Scene = {};

    if (sceneRaw.say !== undefined) {
      scene.say = validateSay(sceneRaw.say, `scenes.${sceneId}.say`);
    }

    if (sceneRaw.prompt !== undefined) {
      scene.prompt = validateTypeObject(sceneRaw.prompt, `scenes.${sceneId}.prompt`) as PromptSpec;
    }

    if (sceneRaw.requires !== undefined) {
      if (!Array.isArray(sceneRaw.requires)) {
        throw new Error(`scenes.${sceneId}.requires must be an array`);
      }
      const requires = sceneRaw.requires.map((item, index) => {
        if (typeof item !== "string" || item.trim().length === 0) {
          throw new Error(`scenes.${sceneId}.requires[${index}] must be a non-empty string`);
        }
        return item.trim();
      });
      scene.requires = [...new Set(requires)];
    }

    if (sceneRaw.fallback_next !== undefined) {
      if (typeof sceneRaw.fallback_next !== "string" || sceneRaw.fallback_next.trim().length === 0) {
        throw new Error(`scenes.${sceneId}.fallback_next must be a non-empty string`);
      }
      scene.fallback_next = sceneRaw.fallback_next;
    }

    if (sceneRaw.action !== undefined) {
      scene.action = validateTypeObject(sceneRaw.action, `scenes.${sceneId}.action`) as ActionSpec;
    }

    if (sceneRaw.on_change !== undefined) {
      scene.on_change = validateOnChange(sceneRaw.on_change, `scenes.${sceneId}.on_change`);
    }

    if (sceneRaw.commit !== undefined) {
      if (!Array.isArray(sceneRaw.commit)) {
        throw new Error(`scenes.${sceneId}.commit must be an array`);
      }
      scene.commit = sceneRaw.commit.map((item, index) => {
        const commit = validateCommit(item, `scenes.${sceneId}.commit[${index}]`);
        return commit as CommitSpec;
      });
    }

    if (sceneRaw.next !== undefined) {
      const directTarget = resolveDirectNextTarget(sceneRaw.next as string | NextSpec, `scenes.${sceneId}.next`);
      if (directTarget !== null) {
        scene.next = typeof sceneRaw.next === "string"
          ? sceneRaw.next
          : { type: "scene", id: directTarget };
      } else {
        scene.next = validateTypeObject(sceneRaw.next, `scenes.${sceneId}.next`) as NextSpec;
      }
    }

    if (scene.on_change && scene.prompt?.type !== "channel_select") {
      throw new Error(`scenes.${sceneId}.on_change is supported only for channel_select prompts`);
    }

    sceneMap[sceneId] = scene;
  }

  if (!(start_scene in sceneMap)) {
    throw new Error(`start_scene \"${start_scene}\" does not exist in scenes`);
  }

  for (const [sceneId, scene] of Object.entries(sceneMap)) {
    const directTarget = resolveDirectNextTarget(scene.next, `scenes.${sceneId}.next`);
    if (directTarget !== null && !(directTarget in sceneMap)) {
      throw new Error(`scenes.${sceneId}.next points to unknown scene \"${directTarget}\"`);
    }

    if (scene.fallback_next && !(scene.fallback_next in sceneMap)) {
      throw new Error(`scenes.${sceneId}.fallback_next points to unknown scene "${scene.fallback_next}"`);
    }
  }

  return {
    id,
    version: versionInt,
    start_scene,
    scenes: sceneMap,
  };
}
