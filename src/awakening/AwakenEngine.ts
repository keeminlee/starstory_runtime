import { advanceScene, loadState, markComplete, setBeatIndex, type GuildOnboardingState } from "../ledger/awakeningStateRepo.js";
import { loadAwakenScript } from "../scripts/awakening/_loader.js";
import type { AwakenScript, Beat, NextSpec, Scene, SceneSay } from "../scripts/awakening/_schema.js";

export const MAX_BEATS_PER_RUN = 25;
export const MAX_DELAY_MS = 15000;
export const MAX_TOTAL_DELAY_MS_PER_RUN = 120000;
const MAX_SCENE_STEPS_PER_RUN = 50;

type RunOptions = {
  db: any;
  scriptId?: string;
  script?: AwakenScript;
  maxBeatsPerRun?: number;
  maxTotalDelayMsPerRun?: number;
  sleepFn?: (ms: number) => Promise<void>;
};

type InteractionLike = {
  guildId?: string;
  deferred?: boolean;
  replied?: boolean;
  deferReply?: (payload: { ephemeral: boolean }) => Promise<unknown>;
  editReply?: (payload: string | { content: string }) => Promise<unknown>;
  followUp?: (payload: { content: string; ephemeral?: boolean }) => Promise<unknown>;
  reply?: (payload: { content: string; ephemeral?: boolean }) => Promise<unknown>;
  channel?: { send?: (payload: string | { content: string }) => Promise<unknown> };
};

export type AwakenRunResult =
  | { status: "completed"; emittedBeatCount: number }
  | { status: "advanced"; emittedBeatCount: number; fromScene: string; toScene: string }
  | { status: "blocked"; emittedBeatCount: number; reason: "prompt" | "action" | "commit" | "next" | "budget" | "budget_delay"; sceneId: string }
  | { status: "noop"; emittedBeatCount: number; reason: "no_state" | "already_completed" };

type SceneRunResult =
  | { status: "completed"; emittedBeatCount: number; sleptMs: number }
  | { status: "advanced"; emittedBeatCount: number; sleptMs: number; fromScene: string; toScene: string; state: GuildOnboardingState }
  | { status: "blocked"; emittedBeatCount: number; sleptMs: number; reason: "prompt" | "action" | "commit" | "next" | "budget" | "budget_delay"; sceneId: string; state: GuildOnboardingState };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampDelay(ms: number | undefined): number {
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    return 0;
  }

  if (ms <= 0) {
    return 0;
  }

  if (ms > MAX_DELAY_MS) {
    console.warn(`[AwakenEngine] clamped beat delay from ${ms}ms to ${MAX_DELAY_MS}ms`);
    return MAX_DELAY_MS;
  }

  return Math.floor(ms);
}

function resolveNextSceneId(next: string | NextSpec | undefined): string | null {
  if (next === undefined) {
    return null;
  }
  if (typeof next === "string") {
    return next;
  }
  if (typeof next === "object" && next !== null && next.type === "scene" && typeof (next as { id?: unknown }).id === "string") {
    return (next as { id: string }).id;
  }
  return null;
}

function resolveBlockerReason(scene: Scene): "prompt" | "action" | "commit" | null {
  if (scene.prompt) return "prompt";
  if (scene.action) return "action";
  if (scene.commit && scene.commit.length > 0) return "commit";
  return null;
}

export function normalizeSay(say: SceneSay | undefined): Beat[] {
  if (say === undefined) return [];
  if (typeof say === "string") {
    return [{ text: say }];
  }
  if (Array.isArray(say)) {
    return say;
  }
  return [say];
}

async function ensureAck(interaction: InteractionLike): Promise<void> {
  if (interaction.deferred || interaction.replied) return;
  if (typeof interaction.deferReply === "function") {
    await interaction.deferReply({ ephemeral: true });
    if (typeof interaction.editReply === "function") {
      await interaction.editReply("Awakening...");
    }
  }
}

async function emitBeat(interaction: InteractionLike, beat: Beat): Promise<void> {
  if (typeof interaction.followUp === "function") {
    await interaction.followUp({ content: beat.text, ephemeral: false });
    return;
  }

  if (interaction.channel?.send) {
    await interaction.channel.send({ content: beat.text });
    return;
  }

  if (typeof interaction.reply === "function") {
    await interaction.reply({ content: beat.text, ephemeral: false });
    return;
  }

  throw new Error("No supported output method on interaction to emit awakening beat");
}

export async function runCurrentScene(
  interaction: InteractionLike,
  script: AwakenScript,
  state: GuildOnboardingState,
  opts: {
    db: any;
    maxBeatsRemaining: number;
    maxDelayRemainingMs: number;
    sleepFn: (ms: number) => Promise<void>;
  },
): Promise<SceneRunResult> {
  const scene = script.scenes[state.current_scene];
  if (!scene) {
    throw new Error(`Awakening scene not found: ${state.current_scene}`);
  }

  const beats = normalizeSay(scene.say);
  let emitted = 0;
  let sleptMs = 0;

  for (let index = state.beat_index; index < beats.length; index += 1) {
    if (emitted >= opts.maxBeatsRemaining) {
      return {
        status: "blocked",
        emittedBeatCount: emitted,
        sleptMs,
        reason: "budget",
        sceneId: state.current_scene,
        state,
      };
    }

    const beat = beats[index]!;
    await emitBeat(interaction, beat);
    state = setBeatIndex(state.guild_id, state.script_id, index + 1, { db: opts.db });
    emitted += 1;

    const delayMs = clampDelay(beat.delay_ms);
    if (sleptMs + delayMs > opts.maxDelayRemainingMs) {
      return {
        status: "blocked",
        emittedBeatCount: emitted,
        sleptMs,
        reason: "budget_delay",
        sceneId: state.current_scene,
        state,
      };
    }

    if (delayMs > 0) {
      await opts.sleepFn(delayMs);
      sleptMs += delayMs;
    }
  }

  const blocker = resolveBlockerReason(scene);
  if (blocker) {
    return {
      status: "blocked",
      emittedBeatCount: emitted,
      sleptMs,
      reason: blocker,
      sceneId: state.current_scene,
      state,
    };
  }

  const nextSceneId = resolveNextSceneId(scene.next);
  if (scene.next !== undefined && nextSceneId === null) {
    return {
      status: "blocked",
      emittedBeatCount: emitted,
      sleptMs,
      reason: "next",
      sceneId: state.current_scene,
      state,
    };
  }

  if (!nextSceneId) {
    setBeatIndex(state.guild_id, state.script_id, 0, { db: opts.db });
    markComplete(state.guild_id, state.script_id, { db: opts.db });
    return {
      status: "completed",
      emittedBeatCount: emitted,
      sleptMs,
    };
  }

  setBeatIndex(state.guild_id, state.script_id, 0, { db: opts.db });
  const advancedState = advanceScene(state.guild_id, state.script_id, nextSceneId, { db: opts.db });
  return {
    status: "advanced",
    emittedBeatCount: emitted,
    sleptMs,
    fromScene: state.current_scene,
    toScene: nextSceneId,
    state: advancedState,
  };
}

export const AwakenEngine = {
  async runWake(interaction: InteractionLike, options: RunOptions): Promise<AwakenRunResult> {
    const script = options.script ?? await loadAwakenScript(options.scriptId ?? "meepo_awaken");
    const guildId = interaction.guildId as string;
    const maxBeatsPerRun = options.maxBeatsPerRun ?? MAX_BEATS_PER_RUN;
    const maxTotalDelayMsPerRun = options.maxTotalDelayMsPerRun ?? MAX_TOTAL_DELAY_MS_PER_RUN;
    const sleepFn = options.sleepFn ?? defaultSleep;

    let state = loadState(guildId, script.id, { db: options.db });
    if (!state) {
      return { status: "noop", reason: "no_state", emittedBeatCount: 0 };
    }

    console.log(`[AwakenEngine] runWake guild=${guildId} scene=${state.current_scene} beat=${state.beat_index}`);

    if (state.completed) {
      return { status: "noop", reason: "already_completed", emittedBeatCount: 0 };
    }

    await ensureAck(interaction);

    let emittedTotal = 0;
    let totalSleptMs = 0;
    let lastAdvance: { fromScene: string; toScene: string } | null = null;

    for (let sceneSteps = 0; sceneSteps < MAX_SCENE_STEPS_PER_RUN; sceneSteps += 1) {
      const remainingBudget = Math.max(0, maxBeatsPerRun - emittedTotal);
      const remainingDelayBudget = Math.max(0, maxTotalDelayMsPerRun - totalSleptMs);
      if (remainingBudget === 0) {
        return {
          status: "blocked",
          reason: "budget",
          sceneId: state.current_scene,
          emittedBeatCount: emittedTotal,
        };
      }
      if (remainingDelayBudget === 0) {
        return {
          status: "blocked",
          reason: "budget_delay",
          sceneId: state.current_scene,
          emittedBeatCount: emittedTotal,
        };
      }

      const result = await runCurrentScene(interaction, script, state, {
        db: options.db,
        maxBeatsRemaining: remainingBudget,
        maxDelayRemainingMs: remainingDelayBudget,
        sleepFn,
      });

      emittedTotal += result.emittedBeatCount;
      totalSleptMs += result.sleptMs;

      if (result.status === "completed") {
        console.log(`[AwakenEngine] script completed: ${script.id}`);
        return {
          status: "completed",
          emittedBeatCount: emittedTotal,
        };
      }

      if (result.status === "blocked") {
        return {
          status: "blocked",
          reason: result.reason,
          sceneId: result.sceneId,
          emittedBeatCount: emittedTotal,
        };
      }

      lastAdvance = {
        fromScene: result.fromScene,
        toScene: result.toScene,
      };
      state = result.state;
    }

    if (lastAdvance) {
      return {
        status: "advanced",
        emittedBeatCount: emittedTotal,
        fromScene: lastAdvance.fromScene,
        toScene: lastAdvance.toScene,
      };
    }

    return {
      status: "blocked",
      reason: "next",
      sceneId: state.current_scene,
      emittedBeatCount: emittedTotal,
    };
  },
};
