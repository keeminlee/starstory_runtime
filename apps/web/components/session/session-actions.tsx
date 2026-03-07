"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCw } from "lucide-react";
import { regenerateSessionRecapApi } from "@/lib/api/sessions";
import { WebApiError } from "@/lib/api/http";
import { StatusChip } from "@/components/shared/status-chip";
import type { SessionDetail } from "@/lib/types";

type SessionActionsProps = {
  session: SessionDetail;
  searchParams?: Record<string, string | string[] | undefined>;
};

type BannerState =
  | { tone: "success"; message: string }
  | { tone: "danger"; message: string }
  | null;

function mapRegenerateError(error: unknown): string {
  if (error instanceof WebApiError) {
    if (error.code === "unauthorized") {
      return "This viewer is not authorized for recap regeneration in the current guild scope.";
    }
    if (error.code === "not_found") {
      return "This session is no longer available for regeneration.";
    }
    if (error.code === "transcript_unavailable") {
      return "Recap generation needs transcript data, but transcript lines are currently unavailable.";
    }
    if (error.code === "generation_failed") {
      return "Recap generation failed this time. Please try again in a moment.";
    }
  }

  return "Recap regeneration failed. Please try again.";
}

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toTranscriptTxt(session: SessionDetail): string {
  const header = [
    `Session: ${session.title}`,
    `Session ID: ${session.id}`,
    `Campaign: ${session.campaignSlug}`,
    `Date: ${session.date}`,
    `Source: ${session.source}`,
    "",
  ];

  const lines = session.transcript.map((entry) => `[${entry.timestamp}] ${entry.speaker}: ${entry.text}`);
  return [...header, ...lines].join("\n");
}

function toRecapTxt(session: SessionDetail): string {
  if (!session.recap) {
    return `Session: ${session.title}\nSession ID: ${session.id}\n\nNo recap available.`;
  }

  return [
    `Session: ${session.title}`,
    `Session ID: ${session.id}`,
    `Campaign: ${session.campaignSlug}`,
    `Generated At: ${session.recap.generatedAt}`,
    `Model: ${session.recap.modelVersion}`,
    "",
    "[Concise]",
    session.recap.concise,
    "",
    "[Balanced]",
    session.recap.balanced,
    "",
    "[Detailed]",
    session.recap.detailed,
  ].join("\n");
}

export function SessionActions({ session, searchParams }: SessionActionsProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);

  const transcriptJson = useMemo(() => JSON.stringify(session.transcript, null, 2), [session.transcript]);
  const recapJson = useMemo(() => JSON.stringify(session.recap, null, 2), [session.recap]);

  const transcriptBaseName = `${session.campaignSlug}-${session.id}-transcript`;
  const recapBaseName = `${session.campaignSlug}-${session.id}-recap`;

  async function handleRegenerateRecap() {
    setIsPending(true);
    setBanner(null);
    try {
      await regenerateSessionRecapApi(
        session.id,
        { reason: "manual-web-regenerate" },
        searchParams
      );
      setBanner({
        tone: "success",
        message: "Recap regeneration started and refreshed successfully.",
      });
      router.refresh();
    } catch (error) {
      setBanner({
        tone: "danger",
        message: mapRegenerateError(error),
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl card-glass p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label={`Source ${session.source}`} tone="info" />
          <StatusChip label={`Recap ${session.artifacts.recap}`} tone={session.artifacts.recap === "available" ? "success" : session.artifacts.recap === "unavailable" ? "danger" : "warning"} />
          <StatusChip label={`Transcript ${session.artifacts.transcript}`} tone={session.artifacts.transcript === "available" ? "success" : session.artifacts.transcript === "unavailable" ? "danger" : "warning"} />
        </div>
        <button
          type="button"
          onClick={handleRegenerateRecap}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-full button-primary px-4 py-2 text-xs font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          {isPending ? "Regenerating recap" : "Regenerate recap"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => triggerDownload(`${transcriptBaseName}.txt`, toTranscriptTxt(session), "text/plain;charset=utf-8")}
          disabled={session.transcript.length === 0}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Transcript .txt
        </button>
        <button
          type="button"
          onClick={() => triggerDownload(`${transcriptBaseName}.json`, transcriptJson, "application/json;charset=utf-8")}
          disabled={session.transcript.length === 0}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Transcript .json
        </button>
        <button
          type="button"
          onClick={() => triggerDownload(`${recapBaseName}.txt`, toRecapTxt(session), "text/plain;charset=utf-8")}
          disabled={!session.recap}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Recap .txt
        </button>
        <button
          type="button"
          onClick={() => triggerDownload(`${recapBaseName}.json`, recapJson, "application/json;charset=utf-8")}
          disabled={!session.recap}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Recap .json
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Viewer data can be read locally; recap regeneration may require model connectivity.
      </p>

      {banner ? (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            banner.tone === "success"
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
              : "border-rose-400/40 bg-rose-400/10 text-rose-200"
          }`}
        >
          {banner.message}
        </div>
      ) : null}
    </section>
  );
}
