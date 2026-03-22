const PRIMARY_AUTH_PROVIDER = "discord";
const STARSTORY_DISCORD_INSTALL_URL = "https://discord.com/oauth2/authorize?client_id=1470521616747200524&permissions=3214336&integration_type=0&scope=bot+applications.commands";

function normalizeCallbackPath(callbackPath: string): string {
  if (!callbackPath.startsWith("/")) {
    return "/";
  }

  return callbackPath;
}

export function buildPrimarySignInPath(callbackPath = "/dashboard"): string {
  const search = new URLSearchParams({
    callbackUrl: normalizeCallbackPath(callbackPath),
  });

  return `/api/auth/signin/${PRIMARY_AUTH_PROVIDER}?${search.toString()}`;
}

export function buildRootSkySignInPath(): string {
  return buildPrimarySignInPath("/");
}

export { PRIMARY_AUTH_PROVIDER };
export { STARSTORY_DISCORD_INSTALL_URL };
