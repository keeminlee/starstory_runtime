import { NextRequest, NextResponse } from "next/server";
import { readSearchParams, jsonError } from "@/app/api/_utils";
import type { SpeakerAttributionBatchRequest } from "@/lib/api/types";
import { resolveWebAuthContext } from "@/lib/server/authContext";
import {
  resolveAuthorizedSessionOwnership,
} from "@/lib/server/sessionReaders";
import { readSessionSpeakerAttributionSnapshot, saveSessionSpeakerAttributionBatch } from "@/lib/server/sessionSpeakerAttributionService";
import { assertUserCanWriteCampaignArchive } from "@/lib/server/writeAuthority";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { sessionId } = await context.params;
    const searchParams = readSearchParams(request);
    const auth = await resolveWebAuthContext(searchParams);
    const { guildId, campaignSlug } = await resolveAuthorizedSessionOwnership({
      authorizedGuildIds: auth.authorizedGuildIds,
      sessionId,
      searchParams,
    });

    const speakerAttribution = readSessionSpeakerAttributionSnapshot({
      guildId,
      campaignSlug,
      sessionId,
    });

    return NextResponse.json({ sessionId, campaignSlug, speakerAttribution }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { sessionId } = await context.params;
    const searchParams = readSearchParams(request);
    const auth = await resolveWebAuthContext(searchParams);
    const { guildId, campaignSlug } = await resolveAuthorizedSessionOwnership({
      authorizedGuildIds: auth.authorizedGuildIds,
      sessionId,
      searchParams,
    });

    assertUserCanWriteCampaignArchive({
      guildId,
      campaignSlug,
      userId: auth.user?.id ?? null,
    });

    const body = (await request.json()) as SpeakerAttributionBatchRequest;
    if (!Array.isArray(body.entries) || body.entries.length === 0) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "entries are required." } },
        { status: 422 }
      );
    }

    const speakerAttribution = await saveSessionSpeakerAttributionBatch({
      guildId,
      campaignSlug,
      sessionId,
      searchParams,
      payload: body,
    });

    return NextResponse.json({ sessionId, campaignSlug, speakerAttribution }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}