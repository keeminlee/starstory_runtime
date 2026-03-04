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

export interface CommitSpec {
  type: string;
  [key: string]: unknown;
}

export type NextSceneRef = {
  type: "scene";
  id: string;
};

export type NextSpec = NextSceneRef | {
  type: string;
  [key: string]: unknown;
};

export type SceneSay = string | Beat | Beat[];

export interface Scene {
  say?: SceneSay;
  prompt?: PromptSpec;
  action?: ActionSpec;
  commit?: CommitSpec[];
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

function validateSay(value: unknown, path: string): SceneSay {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => validateBeat(item, `${path}[${index}]`));
  }

  return validateBeat(value, path);
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

    if (sceneRaw.action !== undefined) {
      scene.action = validateTypeObject(sceneRaw.action, `scenes.${sceneId}.action`) as ActionSpec;
    }

    if (sceneRaw.commit !== undefined) {
      if (!Array.isArray(sceneRaw.commit)) {
        throw new Error(`scenes.${sceneId}.commit must be an array`);
      }
      scene.commit = sceneRaw.commit.map((item, index) => {
        const commit = validateTypeObject(item, `scenes.${sceneId}.commit[${index}]`);
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
  }

  return {
    id,
    version: versionInt,
    start_scene,
    scenes: sceneMap,
  };
}
