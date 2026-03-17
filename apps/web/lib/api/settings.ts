import { fetchJson } from "@/lib/api/http";
import type {
  GuildProviderSettingsResponse,
  UpdateGuildProviderSettingsRequest,
  UpdateGuildProviderSettingsResponse,
} from "@/lib/api/types";

type QueryInput = Record<string, string | string[] | undefined> | undefined;

function toQuery(input: QueryInput): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export async function getGuildProviderSettingsApi(
  searchParams?: QueryInput
): Promise<GuildProviderSettingsResponse> {
  return fetchJson<GuildProviderSettingsResponse>("/api/settings/providers", {
    query: toQuery(searchParams),
  });
}

export async function updateGuildProviderSettingsApi(
  payload: UpdateGuildProviderSettingsRequest,
  searchParams?: QueryInput
): Promise<UpdateGuildProviderSettingsResponse> {
  return fetchJson<UpdateGuildProviderSettingsResponse>("/api/settings/providers", {
    method: "PATCH",
    query: toQuery(searchParams),
    body: payload,
  });
}