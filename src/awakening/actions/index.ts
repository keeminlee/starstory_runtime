import type { GuildOnboardingState } from "../../ledger/awakeningStateRepo.js";
import type { ActionSpec, Scene } from "../../scripts/awakening/_schema.js";

export type AwakeningActionErrorCode =
  | "UNKNOWN_ACTION"
  | "INVALID_ACTION"
  | "ACTION_EXCEPTION"
  | "VOICE_CHANNEL_MISSING"
  | "VOICE_CHANNEL_FETCH_FAILED"
  | "VOICE_CHANNEL_INVALID"
  | "VOICE_JOIN_FAILED"
  | "VOICE_TTS_FAILED";

type ActionResult = {
  ok: boolean;
  code?: AwakeningActionErrorCode;
};

type ActionContext = {
  db: any;
  interaction: any;
  state: GuildOnboardingState;
  sceneId: string;
  action: ActionSpec;
};

function normalizeSceneActions(scene: Scene): ActionSpec[] {
  const raw = (scene as Scene & { action?: ActionSpec | ActionSpec[] }).action;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

async function executeSingleAction(ctx: ActionContext): Promise<ActionResult> {
  const type = typeof ctx.action?.type === "string" ? ctx.action.type : "";
  if (!type) {
    return { ok: false, code: "INVALID_ACTION" };
  }

  if (type === "join_voice_and_speak") {
    const { executeJoinVoiceAndSpeakAction } = await import("./joinVoiceAndSpeak.js");
    return executeJoinVoiceAndSpeakAction({
      db: ctx.db,
      interaction: ctx.interaction,
      state: ctx.state,
      action: ctx.action,
    });
  }

  return { ok: false, code: "UNKNOWN_ACTION" };
}

export async function executeSceneActions(args: {
  db: any;
  interaction: any;
  state: GuildOnboardingState;
  sceneId: string;
  scene: Scene;
}): Promise<void> {
  const actions = normalizeSceneActions(args.scene);
  for (const action of actions) {
    const type = typeof action?.type === "string" ? action.type : "";
    try {
      const result = await executeSingleAction({
        db: args.db,
        interaction: args.interaction,
        state: args.state,
        sceneId: args.sceneId,
        action,
      });

      if (result.ok) {
        console.info(`AWAKEN_ACTION ok type=${type || "unknown"} scene=${args.sceneId}`);
      } else {
        console.warn(
          `AWAKEN_ACTION fail type=${type || "unknown"} scene=${args.sceneId} code=${result.code ?? "ACTION_EXCEPTION"}`
        );
      }
    } catch {
      console.warn(
        `AWAKEN_ACTION fail type=${type || "unknown"} scene=${args.sceneId} code=ACTION_EXCEPTION`
      );
    }
  }
}
