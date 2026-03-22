import { NextRequest, NextResponse } from "next/server";
import { readSearchParams, jsonError } from "@/app/api/_utils";
import { toSessionDetailDto } from "@/lib/mappers/campaignMappers";
import { unarchiveWebSession } from "@/lib/server/sessionReaders";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { sessionId } = await context.params;
    const searchParams = readSearchParams(request);
    const session = await unarchiveWebSession({ sessionId, searchParams });
    return NextResponse.json({ session: toSessionDetailDto(session) }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
