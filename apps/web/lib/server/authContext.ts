import { headers } from "next/headers";

export type WebAuthContext = {
  guildId: string;
  source: "header" | "query" | "env";
  devBypass: boolean;
};

export class WebAuthError extends Error {
  readonly code = "UNAUTHORIZED" as const;
  readonly status = 401;

  constructor(message: string) {
    super(message);
    this.name = "WebAuthError";
  }
}

type ResolveAuthInputs = {
  headerGuild: string | null;
  searchParams?: Record<string, string | string[] | undefined>;
  envGuild?: string | null;
  bypassFlag?: string | null;
  nodeEnv?: string | null;
};

function normalizeQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return (value[0] ?? "").trim() || null;
  }
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function resolveWebAuthContextFromInputs(input: ResolveAuthInputs): WebAuthContext {
  const environment = (input.nodeEnv ?? process.env.NODE_ENV ?? "development").trim();
  const isDevelopment = environment !== "production";
  const bypassEnabled = isDevelopment && (input.bypassFlag ?? process.env.DEV_WEB_BYPASS) === "1";

  const headerGuild = input.headerGuild?.trim() || null;
  if (headerGuild) {
    if (!bypassEnabled) {
      throw new WebAuthError("Guild header override requires development mode with DEV_WEB_BYPASS=1.");
    }
    return {
      guildId: headerGuild,
      source: "header",
      devBypass: true,
    };
  }

  const queryGuild = normalizeQueryValue(input.searchParams?.guildId) ?? normalizeQueryValue(input.searchParams?.guild);
  if (queryGuild) {
    if (!bypassEnabled) {
      throw new WebAuthError("Guild query override requires development mode with DEV_WEB_BYPASS=1.");
    }

    return {
      guildId: queryGuild,
      source: "query",
      devBypass: true,
    };
  }

  const envGuild = input.envGuild?.trim() || process.env.MEEPO_WEB_GUILD_ID?.trim() || null;
  if (envGuild) {
    return {
      guildId: envGuild,
      source: "env",
      devBypass: bypassEnabled,
    };
  }

  throw new WebAuthError("Missing guild context. Set MEEPO_WEB_GUILD_ID or use dev bypass overrides in development.");
}

export async function resolveWebAuthContext(searchParams?: Record<string, string | string[] | undefined>): Promise<WebAuthContext> {
  const headerStore = await headers();
  return resolveWebAuthContextFromInputs({
    headerGuild: headerStore.get("x-meepo-guild-id"),
    searchParams,
    envGuild: process.env.MEEPO_WEB_GUILD_ID,
    bypassFlag: process.env.DEV_WEB_BYPASS,
    nodeEnv: process.env.NODE_ENV,
  });
}
