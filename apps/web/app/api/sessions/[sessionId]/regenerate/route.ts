import { NextRequest, NextResponse } from "next/server";
import { readSearchParams, jsonError } from "@/app/api/_utils";
import { resolveWebAuthContext } from "@/lib/server/authContext";
import { getWebSessionDetail } from "@/lib/server/sessionReaders";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

type RegenerateBody = {
  reason?: string;
};

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { sessionId } = await context.params;
    const searchParams = readSearchParams(request);
    const auth = await resolveWebAuthContext(searchParams);

    let body: RegenerateBody = {};
    try {
      body = (await request.json()) as RegenerateBody;
    } catch {
      body = {};
    }

    const { regenerateSessionRecap } = await import("../../../../../../../src/sessions/sessionRecaps");
    await regenerateSessionRecap({
      guildId: auth.guildId,
      sessionId,
      reason: body.reason,
    });

    const session = await getWebSessionDetail({ sessionId, searchParams });

    return NextResponse.json(
      {
        sessionId: session.id,
        campaignSlug: session.campaignSlug,
        status: session.artifacts.recap,
        warnings: session.warnings,
        recap: session.recap,
      },
      { status: 200 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
