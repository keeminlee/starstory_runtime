import type { CommitSpec } from "../../scripts/awakening/_schema.js";
import type { GuildOnboardingState } from "../../ledger/awakeningStateRepo.js";
import { resolveCampaignSlug, getGuildConfig } from "../../campaign/guildConfig.js";
import { handleSetGuildConfigCommit } from "./commitSetGuildConfig.js";
import { handleWriteMemoryCommit } from "./commitWriteMemory.js";
import { handleSetFlagCommit } from "./commitSetFlag.js";
import { handleAppendRegistryYamlCommit } from "./commitAppendRegistryYaml.js";

export type CommitContext = {
  db: any;
  guildId: string;
  scriptId: string;
  sceneId: string;
  progress: Record<string, unknown>;
  inputs: Record<string, unknown>;
  onboardingState: GuildOnboardingState;
  campaignSlug: string;
  guildConfig: ReturnType<typeof getGuildConfig>;
};

export type CommitHandler = (ctx: CommitContext, commit: CommitSpec) => Promise<void>;

export const commitRegistry: Record<string, CommitHandler> = {
  set_guild_config: handleSetGuildConfigCommit,
  write_memory: handleWriteMemoryCommit,
  set_flag: handleSetFlagCommit,
  append_registry_yaml: handleAppendRegistryYamlCommit,
};

export function buildCommitContext(args: {
  db: any;
  guildId: string;
  scriptId: string;
  sceneId: string;
  progress: Record<string, unknown>;
  inputs: Record<string, unknown>;
  onboardingState: GuildOnboardingState;
}): CommitContext {
  const guildConfig = getGuildConfig(args.guildId);
  return {
    ...args,
    campaignSlug: resolveCampaignSlug({ guildId: args.guildId }),
    guildConfig,
  };
}

export async function executeCommitAction(ctx: CommitContext, commit: CommitSpec): Promise<void> {
  const handler = commitRegistry[commit.type];
  if (!handler) {
    throw new Error(`Unknown awakening commit type: ${commit.type}`);
  }
  await handler(ctx, commit);
}
