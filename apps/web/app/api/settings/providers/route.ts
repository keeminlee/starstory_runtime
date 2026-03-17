import { NextRequest, NextResponse } from "next/server";
import { jsonError, readSearchParams } from "@/app/api/_utils";
import {
  getGuildProviderSettingsModel,
  updateGuildProviderSettings,
} from "@/lib/server/providerSettings";
import type { UpdateGuildProviderSettingsRequest } from "@/lib/api/types";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = readSearchParams(request);
    const settings = await getGuildProviderSettingsModel(searchParams);
    return NextResponse.json({ settings }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = readSearchParams(request);
    const body = (await request.json()) as UpdateGuildProviderSettingsRequest;
    const settings = await updateGuildProviderSettings({
      guildId: body.guildId,
      sttProvider: body.sttProvider,
      llmProvider: body.llmProvider,
      searchParams,
    });
    return NextResponse.json({ settings }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}