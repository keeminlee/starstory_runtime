import { NextRequest, NextResponse } from "next/server";
import { jsonError, readSearchParams } from "@/app/api/_utils";
import { listWebSeenDiscordUsers } from "@/lib/server/registryService";

type RouteContext = {
  params: Promise<{ campaignSlug: string }>;
};

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { campaignSlug } = await context.params;
    const searchParams = readSearchParams(request);
    const users = await listWebSeenDiscordUsers({ campaignSlug, searchParams });
    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}