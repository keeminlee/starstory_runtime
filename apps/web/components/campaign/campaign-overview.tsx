"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, ChevronRight } from "lucide-react";
import { InlineEditableText } from "@/components/shared/inline-editable-text";
import { StatusChip } from "@/components/shared/status-chip";
import type { CampaignSummary } from "@/lib/types";
import { formatSessionDisplayTitle } from "@/lib/campaigns/display";
import { updateCampaignNameApi } from "@/lib/api/campaigns";
import { archiveSessionApi, endSessionApi, updateSessionLabelApi } from "@/lib/api/sessions";
import { WebApiError } from "@/lib/api/http";

type CampaignOverviewProps = {
  campaign: CampaignSummary;
  searchParams?: Record<string, string | string[] | undefined>;
};

export function CampaignOverview({ campaign, searchParams }: CampaignOverviewProps) {
  const router = useRouter();
  const [campaignName, setCampaignName] = useState(campaign.name);
  const [archivingSessionId, setArchivingSessionId] = useState<string | null>(null);
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);
  const [localSessions, setLocalSessions] = useState(campaign.sessions);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scopedSearchParams = useMemo(
    () => ({
      ...(searchParams ?? {}),
      ...(campaign.guildId ? { guild_id: campaign.guildId } : {}),
    }),
    [campaign.guildId, searchParams]
  );

  const showArchived = useMemo(() => {
    const raw = searchParams?.show_archived;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string") {
      return false;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }, [searchParams]);

  useEffect(() => {
    setCampaignName(campaign.name);
  }, [campaign.name]);

  useEffect(() => {
    setLocalSessions(campaign.sessions);
  }, [campaign.sessions]);

  const artifactTone = (status: "available" | "missing" | "unavailable") => {
    if (status === "available") return "success" as const;
    if (status === "unavailable") return "danger" as const;
    return "warning" as const;
  };

  return (
    <div className="space-y-8">
      <header>
        <InlineEditableText
          value={campaignName}
          canEdit={Boolean(campaign.canWrite)}
          ariaLabel="Campaign title"
          maxLength={100}
          emptyValueMessage="Campaign name cannot be empty."
          maxLengthMessage="Campaign name must be 100 characters or fewer."
          inputClassName="min-w-[16rem] border-b border-primary/30 bg-transparent px-0 py-0 text-4xl font-serif text-foreground outline-none transition-colors focus:border-primary"
          onSave={async (nextName) => {
            try {
              const result = await updateCampaignNameApi(campaign.slug, { campaignName: nextName }, scopedSearchParams);
              setCampaignName(result.campaign.name);
              router.refresh();
              return result.campaign.name;
            } catch (error) {
              if (error instanceof WebApiError) {
                throw new Error(error.message);
              }

              throw new Error("Unable to rename campaign right now.");
            }
          }}
          renderDisplay={({ displayValue, canEdit, isSaving, startEditing }) => (
            <h1 className="text-4xl font-serif">
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
        <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">{campaign.slug}</p>
        <p className="mt-2 max-w-3xl text-muted-foreground">{campaign.description}</p>
        {errorMessage ? <p className="mt-2 text-sm text-rose-400">{errorMessage}</p> : null}
      </header>

      <div className="space-y-4">
        {localSessions.map((session) => {
          const displayTitle = formatSessionDisplayTitle({
            label: session.label,
            sessionId: session.id,
          });

          return (
            <div
              key={session.id}
              className="group rounded-xl card-glass p-6 transition-all hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <InlineEditableText
                      value={session.label ?? ""}
                      displayValue={displayTitle}
                      canEdit={Boolean(campaign.canWrite)}
                      ariaLabel="Session title"
                      allowEmpty
                      maxLength={80}
                      maxLengthMessage="Session title must be 80 characters or fewer."
                      inputClassName="min-w-[12rem] border-b border-primary/30 bg-transparent px-0 py-0 text-2xl font-serif text-foreground outline-none transition-colors focus:border-primary"
                      onSave={async (nextValue) => {
                        const nextLabel = nextValue.length > 0 ? nextValue : null;

                        try {
                          const result = await updateSessionLabelApi(session.id, { label: nextLabel }, scopedSearchParams);
                          setLocalSessions((current) =>
                            current.map((entry) =>
                              entry.id === session.id
                                ? {
                                    ...entry,
                                    label: result.session.label,
                                    title: result.session.title,
                                  }
                                : entry
                            )
                          );
                          router.refresh();
                          return result.session.label ?? "";
                        } catch (error) {
                          if (error instanceof WebApiError) {
                            throw new Error(error.message);
                          }

                          throw new Error("Unable to update the session title right now.");
                        }
                      }}
                      renderDisplay={({ displayValue, canEdit, isSaving, startEditing }) =>
                        canEdit ? (
                          <button
                            type="button"
                            onClick={startEditing}
                            disabled={isSaving}
                            className="cursor-text text-left text-2xl font-serif text-foreground decoration-primary/40 underline-offset-4 transition hover:text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {displayValue}
                          </button>
                        ) : (
                          <span className="text-2xl font-serif text-foreground">{displayValue}</span>
                        )
                      }
                    />
                    {campaign.canWrite ? (
                      <>
                        {session.status === "in_progress" ? (
                          <button
                            type="button"
                            disabled={endingSessionId === session.id}
                            title="End session"
                            className="rounded-full border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-rose-400/40 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={async () => {
                              if (!window.confirm("End this session now? This uses the same closure path as showtime end.")) {
                                return;
                              }

                              setEndingSessionId(session.id);
                              setErrorMessage(null);
                              try {
                                const result = await endSessionApi(session.id, scopedSearchParams);
                                setLocalSessions((current) =>
                                  current.map((entry) =>
                                    entry.id === session.id
                                      ? {
                                          ...entry,
                                          status: result.session.status,
                                        }
                                      : entry
                                  )
                                );
                                router.refresh();
                              } catch (error) {
                                if (error instanceof WebApiError) {
                                  setErrorMessage(error.message);
                                } else {
                                  setErrorMessage("Unable to end this session right now.");
                                }
                              } finally {
                                setEndingSessionId(null);
                              }
                            }}
                          >
                            {endingSessionId === session.id ? "Ending" : "End session"}
                          </button>
                        ) : null}
                        {!session.isArchived ? (
                          <button
                            type="button"
                            disabled={archivingSessionId === session.id || session.status === "in_progress"}
                            title={session.status === "in_progress" ? "Active sessions cannot be archived." : "Archive session"}
                            className="rounded-full border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-amber-400/40 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={async () => {
                              if (!window.confirm("Archive this session? It will be hidden from default lists but remain readable by direct link.")) {
                                return;
                              }

                              setArchivingSessionId(session.id);
                              setErrorMessage(null);
                              try {
                                await archiveSessionApi(session.id, scopedSearchParams);
                                setLocalSessions((current) => {
                                  if (showArchived) {
                                    return current.map((entry) =>
                                      entry.id === session.id
                                        ? {
                                            ...entry,
                                            isArchived: true,
                                          }
                                        : entry
                                    );
                                  }

                                  return current.filter((entry) => entry.id !== session.id);
                                });
                                router.refresh();
                              } catch (error) {
                                if (error instanceof WebApiError) {
                                  setErrorMessage(error.message);
                                } else {
                                  setErrorMessage("Unable to archive this session right now.");
                                }
                              } finally {
                                setArchivingSessionId(null);
                              }
                            }}
                          >
                            {archivingSessionId === session.id
                              ? "Archiving"
                              : session.status === "in_progress"
                                ? "Archive blocked"
                                : "Archive session"}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs uppercase tracking-wider text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{session.date}</span>
                    <StatusChip
                      label={
                        session.status === "in_progress"
                          ? "In progress"
                          : session.status === "interrupted"
                            ? "Interrupted"
                            : "Completed"
                      }
                      tone={
                        session.status === "in_progress"
                          ? "warning"
                          : session.status === "interrupted"
                            ? "danger"
                            : "neutral"
                      }
                    />
                      {session.isArchived ? (
                        <StatusChip label="Archived" tone="neutral" />
                      ) : null}
                    {session.sessionOrigin === "lab_legacy" ? (
                      <StatusChip label="Lab legacy" tone="warning" />
                    ) : null}
                    <StatusChip label={`Transcript ${session.artifacts.transcript}`} tone={artifactTone(session.artifacts.transcript)} />
                    <StatusChip label={`Recap ${session.artifacts.recap}`} tone={artifactTone(session.artifacts.recap)} />
                  </div>
                </div>
                <Link
                  href={{
                    pathname: `/campaigns/${campaign.slug}/sessions/${session.id}`,
                    ...(campaign.guildId ? { query: { guild_id: campaign.guildId } } : {}),
                  }}
                  className="self-center"
                >
                  <ChevronRight className="h-5 w-5 text-primary opacity-70" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
