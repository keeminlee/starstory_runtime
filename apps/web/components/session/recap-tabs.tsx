"use client";

import { useState } from "react";
import { StatusChip } from "@/components/shared/status-chip";
import type { RecapTab, SessionRecap } from "@/lib/types";

const TABS: Array<{ id: RecapTab; label: string }> = [
  { id: "concise", label: "Concise" },
  { id: "balanced", label: "Balanced" },
  { id: "detailed", label: "Detailed" },
];

type RecapTabsProps = {
  recap: SessionRecap;
  status?: "available" | "missing" | "unavailable";
  warnings?: string[];
};

export function RecapTabs({ recap, status = "available", warnings = [] }: RecapTabsProps) {
  const [activeTab, setActiveTab] = useState<RecapTab>("balanced");

  return (
    <div className="rounded-2xl card-glass">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="space-y-1">
          <h3 className="font-serif text-lg">Recap</h3>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={status === "available" ? "Recap ready" : `Recap ${status}`} tone={status === "available" ? "success" : status === "unavailable" ? "danger" : "warning"} />
            <StatusChip label={`Model ${recap.modelVersion}`} tone="neutral" />
          </div>
        </div>
        <div className="flex rounded-lg border border-border bg-background/50 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-4 p-6">
        <p className="text-lg italic leading-relaxed text-foreground/90">{recap[activeTab]}</p>
        <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2 text-[11px] uppercase tracking-widest text-muted-foreground">
          Generated {new Date(recap.generatedAt).toLocaleString()}
        </div>
        {warnings.length > 0 ? (
          <p className="text-xs text-amber-200/90">Warnings: {warnings[0]}</p>
        ) : null}
      </div>
    </div>
  );
}
