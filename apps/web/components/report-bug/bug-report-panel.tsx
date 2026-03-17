"use client";

import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { StatusChip } from "@/components/shared/status-chip";
import { buildBugReportBody, LINEAR_BUG_REPORT_URL, type BugReportContext } from "@/lib/bug-report";
import { APP_VERSION } from "@/lib/version";

type Props = {
  context: BugReportContext;
};

export function BugReportPanel({ context }: Props) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const reportBody = buildBugReportBody(context);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(reportBody);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-2xl card-glass p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-serif text-3xl italic">Report a bug</h1>
          <StatusChip label={`App ${APP_VERSION}`} tone="info" />
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Copy the report details below, then open Linear to file the issue. The report includes the current page and session context so engineering can reproduce it faster.
        </p>
        <div className="mt-6 rounded-2xl border border-border/60 bg-background/35 p-4">
          <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">{reportBody}</pre>
        </div>
      </section>

      <aside className="space-y-4 rounded-2xl card-glass p-6">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Actions</h2>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex w-full items-center justify-center gap-2 rounded-full button-primary px-4 py-2 text-xs font-bold uppercase tracking-widest"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy report details
          </button>
          {LINEAR_BUG_REPORT_URL ? (
            <a
              href={LINEAR_BUG_REPORT_URL}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background/40 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Linear
            </a>
          ) : null}
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          {copyState === "copied" ? <p className="text-emerald-300">Copied bug report details.</p> : null}
          {copyState === "failed" ? <p className="text-rose-300">Clipboard copy failed. Select the text manually and paste it into Linear.</p> : null}
          {!LINEAR_BUG_REPORT_URL ? (
            <p>
              Set NEXT_PUBLIC_LINEAR_BUG_REPORT_URL to your Linear issue form URL to enable direct handoff from this page.
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}