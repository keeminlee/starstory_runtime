export function shouldInjectIdentityContext(args: {
  personaId: string;
  modeAtStart?: string | null;
  isMetaPrompt?: boolean;
}): boolean {
  const diegeticPersonaIds = new Set([
    "diegetic_meepo",
    "xoblob",
    "rei",
    "meepo",
  ]);

  if (diegeticPersonaIds.has(args.personaId)) {
    return false;
  }

  if (args.isMetaPrompt || args.personaId === "meta_meepo") {
    return true;
  }

  if (args.modeAtStart === "canon") {
    return true;
  }

  return false;
}
