import { NextRequest, NextResponse } from "next/server";
import { readSearchParams, jsonError } from "@/app/api/_utils";
import { resolveWebAuthContext } from "@/lib/server/authContext";
import { assertDevSurfaceAccess } from "@/lib/server/scopeGuards";
import { readMeepoRuntimeSnapshot } from "@/lib/server/meepoSnapshotReader";
import { isTimeRange, rangeToSinceMs } from "@/lib/types/meepoSnapshot";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = readSearchParams(request);
    const auth = await resolveWebAuthContext(searchParams);

    assertDevSurfaceAccess({ user: auth.user, devBypass: auth.devBypass });

    const guildId =
      (typeof searchParams.guild_id === "string" ? searchParams.guild_id : null) ??
      (typeof searchParams.guildId === "string" ? searchParams.guildId : null) ??
      auth.primaryGuildId;

    if (!guildId) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "guild_id is required." } },
        { status: 422 },
      );
    }

    if (!auth.authorizedGuildIds.includes(guildId) && !auth.devBypass) {
      return NextResponse.json(
        { error: { code: "unauthorized", message: "Guild not in authorized scope." } },
        { status: 403 },
      );
    }

    const campaignSlug =
      (typeof searchParams.campaign_slug === "string" ? searchParams.campaign_slug : null) ??
      (typeof searchParams.campaignSlug === "string" ? searchParams.campaignSlug : null) ??
      null;

    const rawRange = typeof searchParams.range === "string" ? searchParams.range : "7d";
    const range = isTimeRange(rawRange) ? rawRange : "7d";
    const sinceMs = rangeToSinceMs(range);

    const snapshot = readMeepoRuntimeSnapshot({ guildId, campaignSlug, sinceMs, range });

    return NextResponse.json(snapshot, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
