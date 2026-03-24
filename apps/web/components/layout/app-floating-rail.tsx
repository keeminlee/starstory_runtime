"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, SlidersHorizontal, Sparkles, Terminal } from "lucide-react";
import type { ComponentType } from "react";
import { useSession } from "next-auth/react";
import { resolveCampaignTargetPath, useCampaignContext } from "@/components/providers/campaign-context-provider";
import { STARSTORY_DISCORD_INSTALL_URL } from "@/lib/auth/primaryAuth";
import { useVerboseMode } from "@/providers/verbose-mode-provider";

type FloatingItem = {
  key: "campaign" | "settings";
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  disabled?: boolean;
};

function FloatingRailButton({
  href,
  label,
  icon: Icon,
  active = false,
  disabled = false,
}: {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  disabled?: boolean;
}) {
  const className = `group flex h-11 w-11 items-center overflow-hidden rounded-2xl border px-3 shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur transition-[width,background-color,border-color] duration-200 ${
    active
      ? "w-[11rem] border-primary/35 bg-primary/10 text-foreground"
      : disabled
        ? "border-border/50 bg-background/60 text-muted-foreground/60"
        : "border-border/70 bg-background/82 text-foreground hover:w-[11rem] hover:border-primary/25 hover:bg-background/92"
  }`;

  return (
    <Link
      href={href}
      className={className}
      aria-disabled={disabled ? true : undefined}
      tabIndex={disabled ? -1 : undefined}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
        }
      }}
    >
      <Icon className={`h-5 w-5 shrink-0 ${active ? "text-primary" : disabled ? "text-muted-foreground/60" : "text-muted-foreground"}`} />
      <span
        className={`overflow-hidden whitespace-nowrap pl-3 text-sm font-medium transition-all duration-200 ${
          active ? "max-w-28 opacity-100" : "max-w-0 opacity-0 group-hover:max-w-28 group-hover:opacity-100"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}

export function AppFloatingRail() {
  const pathname = usePathname();
  const { status } = useSession();
  const { activeCampaignSlug, activeGuildId } = useCampaignContext();

  const { verboseModeEnabled } = useVerboseMode();
  const hasActiveCampaign = Boolean(activeCampaignSlug);
  const showSettings = status === "authenticated";
  const campaignHref = hasActiveCampaign
    ? resolveCampaignTargetPath({ routeType: "campaign-sessions", campaignSlug: activeCampaignSlug ?? "", guildId: activeGuildId })
    : "/dashboard";

  const items: FloatingItem[] = [
    { key: "campaign", href: campaignHref, label: "Campaign", icon: BookOpen, disabled: !hasActiveCampaign },
    ...(showSettings ? [{ key: "settings" as const, href: "/settings", label: "Settings", icon: SlidersHorizontal }] : []),
  ];

  return (
    <div className="pointer-events-none fixed left-6 top-6 z-30 flex flex-col gap-3">
      <div className="pointer-events-auto">
        <a
          href={STARSTORY_DISCORD_INSTALL_URL}
          target="_blank"
          rel="noreferrer"
          className="group flex h-11 w-11 items-center overflow-hidden rounded-2xl border border-border/70 bg-background/82 px-3 shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur transition-[width,background-color,border-color] duration-200 hover:w-[13.5rem] hover:border-primary/25 hover:bg-background/92"
          aria-label="Invite Discord Bot"
        >
          <Sparkles className="h-5 w-5 shrink-0 animate-pulse text-primary" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap pl-3 text-sm font-medium text-foreground opacity-0 transition-all duration-200 group-hover:max-w-[10.5rem] group-hover:opacity-100">
            Invite Discord Bot
          </span>
        </a>
      </div>

      <nav className="pointer-events-auto flex flex-col gap-3">
          {items.map((item) => {
            const active =
              item.key === "campaign"
                ? pathname.startsWith("/campaigns/")
                : pathname.startsWith("/settings");

            return (
              <FloatingRailButton
                key={item.key}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={active}
                disabled={item.disabled}
              />
            );
          })}
          {verboseModeEnabled && activeGuildId && (
            <FloatingRailButton
              href={`/dev/meepo?guild_id=${activeGuildId}`}
              label="Dev Dashboard"
              icon={Terminal}
              active={pathname.startsWith("/dev/meepo")}
            />
          )}
      </nav>
    </div>
  );
}