import { NextRequest, NextResponse } from "next/server";
import { readSearchParams, jsonError } from "@/app/api/_utils";
import { readEntityAppearances } from "@/lib/server/recapAnnotationService";
import { getWebCampaignDetail } from "@/lib/server/campaignReaders";
import type { EntityAppearanceDto } from "@/lib/registry/types";

type RouteContext = {
  params: Promise<{ campaignSlug: string; entryId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { campaignSlug, entryId } = await context.params;
    const searchParams = readSearchParams(request);

    const campaign = await getWebCampaignDetail({ campaignSlug, searchParams });
    if (!campaign) {
      return NextResponse.json(
        { error: { code: "not_found", message: `Campaign not found: ${campaignSlug}` } },
        { status: 404 }
      );
    }

    const guildId = campaign.guildId;
    if (!guildId) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "Campaign has no guild context." } },
        { status: 422 }
      );
    }

    const rows = readEntityAppearances({ guildId, campaignSlug, entityId: entryId });

    const appearances: EntityAppearanceDto[] = rows.map((row) => ({
      sessionId: row.session_id,
      sessionLabel: row.session_label,
      sessionDate: row.session_date ?? "",
      excerpt: row.excerpt,
      mentionCount: row.mention_count,
    }));

    return NextResponse.json({ entityId: entryId, appearances }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
