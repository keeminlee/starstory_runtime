import { NextRequest, NextResponse } from "next/server";
import { readSearchParams, jsonError } from "@/app/api/_utils";
import { readAnnotatedRecaps } from "@/lib/server/recapAnnotationService";
import { resolveWebAuthContext } from "@/lib/server/authContext";
import { resolveAuthorizedSessionOwnership } from "@/lib/server/sessionReaders";

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

    const annotations = readAnnotatedRecaps({ guildId, campaignSlug, sessionId });
    return NextResponse.json({ sessionId, annotations }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
