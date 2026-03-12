import { NextRequest, NextResponse } from "next/server";
import { jsonError, readSearchParams } from "@/app/api/_utils";
import { revertEntityReviewBatch } from "@/lib/server/entityResolutionService";
import type { RevertEntityReviewBatchRequest } from "@/lib/api/types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = readSearchParams(request);
    const body = (await request.json()) as RevertEntityReviewBatchRequest;

    if (!body.sessionId || !body.batchId) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "sessionId and batchId are required." } },
        { status: 422 }
      );
    }

    const result = await revertEntityReviewBatch({
      sessionId: body.sessionId,
      batchId: body.batchId,
      searchParams,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}