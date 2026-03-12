import { NextRequest, NextResponse } from "next/server";
import { readSearchParams, jsonError } from "@/app/api/_utils";
import { createEntityFromCandidate } from "@/lib/server/entityResolutionService";
import type { CreateEntityFromCandidateRequest } from "@/lib/api/types";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { sessionId } = await context.params;
    const searchParams = readSearchParams(request);
    const body = (await request.json()) as CreateEntityFromCandidateRequest;

    if (!body.candidateName || !body.category) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "candidateName and category are required." } },
        { status: 422 }
      );
    }

    const resolution = await createEntityFromCandidate({
      sessionId,
      candidateName: body.candidateName,
      category: body.category,
      canonicalName: body.canonicalName,
      notes: body.notes,
      searchParams,
    });

    return NextResponse.json({ resolution }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
