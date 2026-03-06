import type { GuildOnboardingState } from "../ledger/awakeningStateRepo.js";

export function isAwakeningSetupWritable(args: {
  onboardingState: GuildOnboardingState | null;
  guildConfig: { awakened?: number | boolean | null } | null;
}): boolean {
  if (!args.onboardingState) {
    return false;
  }

  if (args.onboardingState.completed) {
    return false;
  }

  const awakened = args.guildConfig?.awakened;
  if (awakened === true || awakened === 1) {
    return false;
  }

  return true;
}
