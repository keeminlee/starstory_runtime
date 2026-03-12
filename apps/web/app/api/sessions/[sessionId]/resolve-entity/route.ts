import { NextRequest, NextResponse } from "next/server";
import { readSearchParams, jsonError } from "@/app/api/_utils";
import { resolveEntity } from "@/lib/server/entityResolutionService";
import type { ResolveEntityRequest } from "@/lib/api/types";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { sessionId } = await context.params;
    const searchParams = readSearchParams(request);
    const body = (await request.json()) as ResolveEntityRequest;

    if (!body.candidateName || !body.entityId) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "candidateName and entityId are required." } },
        { status: 422 }
      );
    }

    const resolution = await resolveEntity({
      sessionId,
      candidateName: body.candidateName,
      entityId: body.entityId,
      searchParams,
    });

    return NextResponse.json({ resolution }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
