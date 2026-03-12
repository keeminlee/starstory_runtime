import { NextRequest, NextResponse } from "next/server";
import { jsonError, readSearchParams } from "@/app/api/_utils";
import { saveEntityReviewBatch } from "@/lib/server/entityResolutionService";
import type { SaveEntityReviewBatchRequest } from "@/lib/api/types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = readSearchParams(request);
    const body = (await request.json()) as SaveEntityReviewBatchRequest;

    if (!body.sessionId || !Array.isArray(body.decisions)) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "sessionId and decisions are required." } },
        { status: 422 }
      );
    }

    const result = await saveEntityReviewBatch({
      sessionId: body.sessionId,
      guildId: body.guildId,
      campaignSlug: body.campaignSlug,
      decisions: body.decisions,
      searchParams,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}