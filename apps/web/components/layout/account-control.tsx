"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

function initialsFromName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "S";
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

type AccountControlProps = {
  displayName: string;
  avatarUrl: string | null;
};

export function AccountControl({ displayName, avatarUrl }: AccountControlProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const expanded = isHovered || isOpen;

  /* Dismiss listeners — only active while menu is open */
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const avatarEl = avatarUrl ? (
    <img src={avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/14 text-xs font-semibold text-primary">
      {initialsFromName(displayName)}
    </span>
  );

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className={[
          "flex h-11 items-center rounded-full border backdrop-blur",
          "transition-all duration-200 ease-out",
          "shadow-[0_12px_30px_rgba(0,0,0,0.18)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          expanded
            ? "border-primary/28 bg-background/94 pl-1.5 pr-3"
            : "border-border/70 bg-background/82 px-1.5 hover:border-primary/28 hover:bg-background/92",
        ].join(" ")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Account"
      >
        {avatarEl}
        <span
          className={[
            "overflow-hidden whitespace-nowrap text-sm font-medium text-foreground",
            "transition-all duration-200 ease-out",
            expanded
              ? "ml-2 max-w-[8rem] opacity-100"
              : "ml-0 max-w-0 opacity-0",
          ].join(" ")}
        >
          {displayName}
        </span>
      </button>

      {/* ── Dropdown panel ── */}
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] min-w-full rounded-xl border border-border/70 bg-background/95 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/60"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}