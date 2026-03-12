import { NextRequest, NextResponse } from "next/server";
import { jsonError, readSearchParams } from "@/app/api/_utils";
import { getEntityReviewBatchesForSession } from "@/lib/server/entityResolutionService";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { sessionId } = await context.params;
    const searchParams = readSearchParams(request);
    const result = await getEntityReviewBatchesForSession({ sessionId, searchParams });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}