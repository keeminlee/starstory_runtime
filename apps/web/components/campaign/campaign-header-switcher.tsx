"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useCampaignContext } from "@/components/providers/campaign-context-provider";

function getFallbackLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "S";
  }

  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function GuildIconAvatar({
  guildIconUrl,
  label,
  className,
}: {
  guildIconUrl?: string | null;
  label: string;
  className: string;
}) {
  if (guildIconUrl) {
    return <img src={guildIconUrl} alt={`${label} icon`} className={`${className} rounded-full object-cover`} loading="lazy" />;
  }

  return (
    <span className={`${className} flex items-center justify-center rounded-full bg-primary/14 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary`}>
      {getFallbackLabel(label)}
    </span>
  );
}

export function CampaignHeaderSwitcher() {
  const { activeScopeKey, campaigns, realCampaigns, selectCampaign } = useCampaignContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const options = useMemo(() => campaigns.filter((campaign) => campaign.type === "user"), [campaigns]);
  const selectedCampaign = useMemo(() => {
    if (activeScopeKey) {
      return options.find((campaign) => campaign.scopeKey === activeScopeKey) ?? null;
    }

    return options[0] ?? null;
  }, [activeScopeKey, options]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  if (realCampaigns.length <= 1 || !selectedCampaign) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setMenuOpen((current) => !current)}
        className="group inline-flex h-11 items-center gap-2 rounded-full border border-border/60 bg-background/58 px-2.5 text-foreground shadow-[0_14px_34px_rgba(0,0,0,0.18)] backdrop-blur transition-[border-color,background-color,transform] duration-200 hover:border-primary/28 hover:bg-background/78 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Switch campaign"
      >
        <GuildIconAvatar
          guildIconUrl={selectedCampaign.guildIconUrl}
          label={selectedCampaign.guildName || selectedCampaign.name}
          className="h-7 w-7 border border-border/60"
        />
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${menuOpen ? "rotate-180 text-primary" : "rotate-0 group-hover:text-foreground"}`} />
      </button>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-3 min-w-[20rem] overflow-hidden rounded-[1.4rem] border border-border/70 bg-background/95 p-2 shadow-[0_22px_60px_rgba(0,0,0,0.32)] backdrop-blur"
        >
          {options.map((campaign) => {
            const isActive = campaign.scopeKey === selectedCampaign.scopeKey;

            return (
              <button
                key={campaign.scopeKey}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  setMenuOpen(false);
                  if (!isActive) {
                    selectCampaign(campaign.scopeKey);
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-left transition-colors ${
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-foreground/92 hover:bg-muted/55"
                }`}
              >
                <GuildIconAvatar
                  guildIconUrl={campaign.guildIconUrl}
                  label={campaign.guildName || campaign.name}
                  className="h-10 w-10 border border-border/60"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-sm text-foreground">{campaign.name}</div>
                  <div className="truncate text-xs tracking-wide text-muted-foreground">{campaign.guildName}</div>
                </div>
                <Check className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-transparent"}`} />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}