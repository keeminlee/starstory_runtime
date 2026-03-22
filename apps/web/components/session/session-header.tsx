"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ChevronRight, Clock } from "lucide-react";
import { InlineEditableText } from "@/components/shared/inline-editable-text";
import { StatusChip } from "@/components/shared/status-chip";
import type { StatusChipTone } from "@/components/shared/status-chip";
import type { SessionDetail } from "@/lib/types";
import { formatSessionDisplayTitle } from "@/lib/campaigns/display";
import { archiveSessionApi, endSessionApi, updateSessionLabelApi } from "@/lib/api/sessions";
import { WebApiError } from "@/lib/api/http";
import { buildBugReportHref } from "@/lib/bug-report";

type SessionHeaderProps = {
  session: SessionDetail;
  searchParams?: Record<string, string | string[] | undefined>;
};

export function SessionHeader({ session, searchParams }: SessionHeaderProps) {
  const router = useRouter();
  const [label, setLabel] = useState(session.label ?? "");
  const [isArchiving, setIsArchiving] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const statusTone = session.status === "in_progress" ? "warning" : session.status === "interrupted" ? "danger" : "success";
  type StatusChipModel = { label: string; tone: StatusChipTone };
  const sessionLabel = useMemo(
    () => formatSessionDisplayTitle({ label: label.trim().length > 0 ? label.trim() : null, sessionId: session.id }),
    [label, session.id]
  );
  const statusChips = useMemo(() => {
    const chips: StatusChipModel[] = [
      {
        label:
          session.status === "in_progress"
            ? "In progress"
            : session.status === "interrupted"
              ? "Interrupted"
              : "Completed",
        tone: statusTone,
      },
      {
        label: `Source ${session.source}`,
        tone: "info" as const,
      },
      {
        label: session.sessionOrigin === "lab_legacy" ? "Origin lab legacy" : "Origin showtime",
        tone: session.sessionOrigin === "lab_legacy" ? ("info" as const) : ("neutral" as const),
      },
      ...(session.isArchived
        ? [
            {
              label: "Archived",
              tone: "neutral" as const,
            },
          ]
        : []),
      {
        label:
          session.status === "in_progress"
            ? "Transcript live"
            : session.artifacts.transcript === "available"
              ? "Transcript ready"
              : session.artifacts.transcript === "unavailable"
                ? "Transcript unavailable"
                : "Transcript missing",
        tone:
          session.status === "in_progress"
            ? "warning"
            : session.artifacts.transcript === "available"
              ? "success"
              : session.artifacts.transcript === "unavailable"
                ? "danger"
                : "warning",
      },
      ...(session.recapPhase === "ended_pending_attribution"
        ? [
            {
              label: "Attribution needed",
              tone: "warning" as const,
            },
          ]
        : []),
    ];

    const seen = new Set<string>();
    return chips.filter((chip) => {
      const key = chip.label.trim().toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [session.artifacts.transcript, session.isArchived, session.recapPhase, session.sessionOrigin, session.source, session.status, statusTone]);
  const reportBugHref = useMemo(
    () =>
      buildBugReportHref({
        path: `/campaigns/${session.campaignSlug}/sessions/${session.id}`,
        campaignSlug: session.campaignSlug,
        sessionId: session.id,
        sessionTitle: sessionLabel,
        issue: session.recapPhase === "failed" ? "Recap issue" : null,
      }),
    [session.campaignSlug, session.id, session.recapPhase, sessionLabel]
  );

  return (
    <header className="space-y-4">
      <nav className="flex flex-wrap items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground">
        <Link href="/dashboard" className="hover:text-primary">Dashboard</Link>
        <ChevronRight className="h-3 w-3" />
          <Link href={`/campaigns/${session.campaignSlug}/sessions`} className="hover:text-primary">{session.campaignSlug}</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground/80">{sessionLabel}</span>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <InlineEditableText
              value={label}
              displayValue={sessionLabel}
              canEdit={Boolean(session.canWrite)}
              ariaLabel="Session title"
              allowEmpty
              maxLength={80}
              maxLengthMessage="Session title must be 80 characters or fewer."
              inputClassName="min-w-[16rem] border-b border-primary/30 bg-transparent px-0 py-0 text-5xl font-serif italic text-foreground outline-none transition-colors focus:border-primary"
              onSave={async (nextValue) => {
                const nextLabel = nextValue.length > 0 ? nextValue : null;

                try {
                  const result = await updateSessionLabelApi(session.id, { label: nextLabel }, searchParams);
                  setLabel(result.session.label ?? "");
                  router.refresh();
                  return result.session.label ?? "";
                } catch (error) {
                  if (error instanceof WebApiError) {
                    throw new Error(error.message);
                  }

                  throw new Error("Unable to update the session title right now.");
                }
              }}
              renderDisplay={({ displayValue, canEdit, isSaving, startEditing }) => (
                <h1 className="text-5xl font-serif italic">
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={startEditing}
                      disabled={isSaving}
                      className="cursor-text text-left text-foreground decoration-primary/40 underline-offset-4 transition hover:text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {displayValue}
                    </button>
                  ) : (
                    displayValue
                  )}
                </h1>
              )}
            />
            {session.canWrite ? (
              <>
                {session.status === "in_progress" ? (
                  <button
                    type="button"
                    disabled={isEnding}
                    title="End session"
                    className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-rose-400/40 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={async () => {
                      if (!window.confirm("End this session now? This uses the same closure path as showtime end.")) {
                        return;
                      }

                      setIsEnding(true);
                      setErrorMessage(null);
                      try {
                        await endSessionApi(session.id, searchParams);
                        router.refresh();
                      } catch (error) {
                        if (error instanceof WebApiError) {
                          setErrorMessage(error.message);
                        } else {
                          setErrorMessage("Unable to end this session right now.");
                        }
                      } finally {
                        setIsEnding(false);
                      }
                    }}
                  >
                    {isEnding ? "Ending" : "End session"}
                  </button>
                ) : null}
                {!session.isArchived ? (
                  <button
                    type="button"
                    disabled={isArchiving || session.status === "in_progress"}
                    title={session.status === "in_progress" ? "Active sessions cannot be archived." : "Archive session"}
                    className="group flex h-9 w-9 items-center overflow-hidden rounded-full border border-border/70 bg-background/58 px-2.5 shadow-[0_12px_26px_rgba(0,0,0,0.16)] transition-[width,border-color,background-color] duration-200 hover:w-[10.75rem] hover:border-amber-400/40 hover:bg-background/82 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={async () => {
                      if (!window.confirm("Archive this session? It will be hidden from default lists but remain readable by direct link.")) {
                        return;
                      }

                      setIsArchiving(true);
                      setErrorMessage(null);
                      try {
                        await archiveSessionApi(session.id, searchParams);
                        router.refresh();
                      } catch (error) {
                        if (error instanceof WebApiError) {
                          setErrorMessage(error.message);
                        } else {
                          setErrorMessage("Unable to archive this session right now.");
                        }
                      } finally {
                        setIsArchiving(false);
                      }
                    }}
                  >
                    <Archive className="h-4 w-4 shrink-0 text-amber-200/80" />
                    <span className="max-w-0 overflow-hidden whitespace-nowrap pl-2 text-xs font-semibold uppercase tracking-wider opacity-0 transition-all duration-200 group-hover:max-w-[7.5rem] group-hover:opacity-100">
                      {isArchiving ? "Archiving" : session.status === "in_progress" ? "Archive blocked" : "Archive session"}
                    </span>
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
          <p className="mt-2 text-sm uppercase tracking-widest text-primary/70">{session.campaignName}</p>
          {errorMessage ? <p className="mt-2 text-sm text-rose-400">{errorMessage}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {statusChips.map((chip) => (
              <StatusChip key={chip.label} label={chip.label} tone={chip.tone} />
            ))}
          </div>
        </div>
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Link
            href={reportBugHref}
            className="rounded-full border border-border px-3 py-1 font-semibold transition-colors hover:border-primary/40 hover:text-primary"
          >
            Report bug
          </Link>
          <Clock className="h-3.5 w-3.5" />
          Recorded {session.date}
        </div>
      </div>
    </header>
  );
}
