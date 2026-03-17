"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

type CampaignSessionsActionsProps = {
  campaignSlug: string;
  guildId: string | null;
  showArchived: boolean;
};

export function CampaignSessionsActions({ campaignSlug, guildId, showArchived }: CampaignSessionsActionsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentShowArchived = useMemo(() => {
    const value = searchParams.get("show_archived");
    if (typeof value !== "string") {
      return showArchived;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }, [searchParams, showArchived]);

  const compendiumHref = useMemo(() => {
    const params = new URLSearchParams();
    if (guildId) {
      params.set("guild_id", guildId);
    }

    const query = params.toString();
    return query.length > 0 ? `/campaigns/${campaignSlug}/compendium?${query}` : `/campaigns/${campaignSlug}/compendium`;
  }, [campaignSlug, guildId]);

  function setArchivedVisibility(nextShowArchived: boolean): void {
    const params = new URLSearchParams(searchParams.toString());
    if (guildId) {
      params.set("guild_id", guildId);
    }

    if (nextShowArchived) {
      params.set("show_archived", "1");
    } else {
      params.delete("show_archived");
    }

    const query = params.toString();
    const nextHref = query.length > 0 ? `${pathname}?${query}` : pathname;

    router.replace(nextHref, { scroll: false });
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={() => setArchivedVisibility(!currentShowArchived)}
        className="control-button-ghost rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider"
      >
        {currentShowArchived ? "Showing archived" : "Show archived"}
      </button>
      {currentShowArchived ? (
        <button
          type="button"
          onClick={() => setArchivedVisibility(false)}
          className="control-button-ghost rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider"
        >
          Hide archived
        </button>
      ) : null}
      <Link
        href={compendiumHref}
        className="control-button-ghost rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider"
      >
        Open Compendium
      </Link>
    </div>
  );
}