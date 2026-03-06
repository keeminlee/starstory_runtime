import type { CommitSpec } from "../../scripts/awakening/_schema.js";
import type { CommitContext } from "./commitActionRegistry.js";
import { requireStringField, resolveCommitValue } from "./commitUtils.js";
import { DM_DISPLAY_NAME_KEY, upsertDmDisplayNameMemory, upsertGuildMemory } from "../../meepoMind/meepoMindWriter.js";

export async function handleWriteMemoryCommit(ctx: CommitContext, commit: CommitSpec): Promise<void> {
  const memoryKey = requireStringField(commit, "memory_key");
  const scope = (commit as Record<string, unknown>).scope;
  if (scope !== undefined && scope !== "guild") {
    throw new Error("write_memory.scope supports only guild in Sprint 5");
  }

  const value = resolveCommitValue({ commit, inputs: ctx.inputs });
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("write_memory resolved value must be a non-empty string");
  }

  if (memoryKey === DM_DISPLAY_NAME_KEY) {
    upsertDmDisplayNameMemory({
      db: ctx.db,
      guildId: ctx.guildId,
      displayName: value,
      source: "awakening_commit",
    });
    return;
  }

  upsertGuildMemory({
    db: ctx.db,
    guildId: ctx.guildId,
    key: memoryKey,
    text: value,
    tags: ["awakening"],
    source: "awakening_commit",
  });
}
