export class ScopeGuardError extends Error {
  readonly code = "SCOPE_VIOLATION" as const;
  readonly status = 404;

  constructor(message: string) {
    super(message);
    this.name = "ScopeGuardError";
  }
}

export function isCampaignSlugInScope(args: {
  requestedCampaignSlug: string;
  resolvedCampaignSlug: string;
}): boolean {
  return args.requestedCampaignSlug === args.resolvedCampaignSlug;
}

export function assertSessionScope(args: {
  authGuildId: string;
  sessionGuildId: string;
}): void {
  if (args.authGuildId !== args.sessionGuildId) {
    throw new ScopeGuardError("Session is out of scope for the active guild.");
  }
}
