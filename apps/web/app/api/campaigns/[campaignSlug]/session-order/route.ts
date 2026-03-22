import { NextRequest, NextResponse } from "next/server";
import { readSearchParams, jsonError } from "@/app/api/_utils";
import { getWebSessionDisplayOrder, updateWebSessionDisplayOrder } from "@/lib/server/campaignReaders";

type RouteContext = {
  params: Promise<{ campaignSlug: string }>;
};

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { campaignSlug } = await context.params;
    const searchParams = readSearchParams(request);
    const orderedSessionIds = await getWebSessionDisplayOrder({ campaignSlug, searchParams });
    return NextResponse.json({ orderedSessionIds: orderedSessionIds ?? [] }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { campaignSlug } = await context.params;
    const searchParams = readSearchParams(request);
    const body = (await request.json()) as { orderedSessionIds?: unknown };
    const orderedSessionIds = body.orderedSessionIds;

    if (!Array.isArray(orderedSessionIds)) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "orderedSessionIds must be an array." } },
        { status: 422 },
      );
    }

    const saved = await updateWebSessionDisplayOrder({
      campaignSlug,
      orderedSessionIds: orderedSessionIds as string[],
      searchParams,
    });

    return NextResponse.json({ orderedSessionIds: saved }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
