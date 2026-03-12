import { NextRequest, NextResponse } from "next/server";
import { readSearchParams, jsonError } from "@/app/api/_utils";
import { ignoreEntityCandidate } from "@/lib/server/entityResolutionService";
import type { IgnoreEntityCandidateRequest } from "@/lib/api/types";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { sessionId } = await context.params;
    const searchParams = readSearchParams(request);
    const body = (await request.json()) as IgnoreEntityCandidateRequest;

    if (!body.candidateName) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "candidateName is required." } },
        { status: 422 }
      );
    }

    const resolution = await ignoreEntityCandidate({
      sessionId,
      candidateName: body.candidateName,
      searchParams,
    });

    return NextResponse.json({ resolution }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
