import type { CommitSpec } from "../../scripts/awakening/_schema.js";
import type { CommitContext } from "./commitActionRegistry.js";
import { requireStringField, resolveCommitValue } from "./commitUtils.js";
import { setGuildAwakened } from "../../campaign/guildConfig.js";

export async function handleSetFlagCommit(ctx: CommitContext, commit: CommitSpec): Promise<void> {
  const key = requireStringField(commit, "key");
  const value = resolveCommitValue({ commit, inputs: ctx.inputs });

  if (key === "awakened") {
    if (typeof value !== "boolean") {
      throw new Error("set_flag.awakened must resolve to a boolean");
    }
    setGuildAwakened(ctx.guildId, value);
    return;
  }

  throw new Error(`Unsupported set_flag key: ${key}`);
}
