"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { InlineEditableText } from "@/components/shared/inline-editable-text";
import { StatusChip } from "@/components/shared/status-chip";
import type { StatusChipTone } from "@/components/shared/status-chip";
import {
  getSessionDetailApi,
  getAnnotatedRecapsApi,
  getEntityCandidatesApi,
  regenerateSessionRecapApi,
} from "@/lib/api/sessions";
import { updateSessionLabelApi } from "@/lib/api/sessions";
import { WebApiError } from "@/lib/api/http";
import { AnnotatedRecapRenderer } from "@/components/shared/annotated-recap-renderer";
import { SpeakerAttributionPanel } from "@/components/session/speaker-attribution-panel";
import { formatSessionDisplayTitle } from "@/lib/campaigns/display";
import { useVerboseMode } from "@/providers/verbose-mode-provider";
import type {
  RecapTab,
  SessionArtifactStatus,
  SessionAnnotatedRecaps,
  SessionRecap,
  SessionRecapPhase,
  SessionSpeakerAttributionState,
  SessionSummary,
} from "@/lib/types";
import type { EntityCandidateDto, RegistrySnapshotDto } from "@/lib/registry/types";

type ChronicleRecapPaneProps = {
  selectedSessionId: string | null;
  selectedSession: SessionSummary | null;
  campaignSlug: string;
  guildId: string | null;
  canEditSessionTitle: boolean;
  canWrite: boolean;
  searchParams: Record<string, string | string[] | undefined>;
  registry: RegistrySnapshotDto | null;
};

const TABS: Array<{ id: RecapTab; label: string }> = [
  { id: "concise", label: "Concise" },
  { id: "balanced", label: "Balanced" },
  { id: "detailed", label: "Detailed" },
];

function formatSessionDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function resolveDefaultTab(recap: SessionRecap | null): RecapTab {
  if (!recap) return "balanced";
  if (recap.balanced.trim().length > 0) return "balanced";
  if (recap.concise.trim().length > 0) return "concise";
  if (recap.detailed.trim().length > 0) return "detailed";
  return "balanced";
}

function artifactTone(status: SessionArtifactStatus): StatusChipTone {
  if (status === "available") return "success";
  if (status === "unavailable") return "danger";
  return "warning";
}

export function ChronicleRecapPane({
  selectedSessionId,
  selectedSession,
  campaignSlug,
  guildId,
  canEditSessionTitle,
  canWrite,
  searchParams,
  registry,
}: ChronicleRecapPaneProps) {
  const router = useRouter();
  const { verboseModeEnabled } = useVerboseMode();
  const [recap, setRecap] = useState<SessionRecap | null>(null);
  const [recapStatus, setRecapStatus] = useState<SessionArtifactStatus>("missing");
  const [recapPhase, setRecapPhase] = useState<SessionRecapPhase | null>(null);
  const [speakerAttribution, setSpeakerAttribution] = useState<SessionSpeakerAttributionState | null>(null);
  const [annotations, setAnnotations] = useState<SessionAnnotatedRecaps | null>(null);
  const [candidates, setCandidates] = useState<EntityCandidateDto[]>([]);
  const [activeTab, setActiveTab] = useState<RecapTab>("balanced");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState(selectedSession?.label ?? "");

  const scopedSearchParams = useMemo(
    () => {
      const query: Record<string, string> = { campaign_slug: campaignSlug };
      if (guildId) query.guild_id = guildId;
      return query;
    },
    [campaignSlug, guildId],
  );

  useEffect(() => {
    setLabel(selectedSession?.label ?? "");
  }, [selectedSession?.id, selectedSession?.label]);

  const fetchSessionDetail = useCallback(
    async (sessionId: string) => {
      setIsLoading(true);
      setError(null);
      setRecap(null);
      setRecapStatus("missing");
      setRecapPhase(null);
      setSpeakerAttribution(null);
      setAnnotations(null);
      setCandidates([]);
      try {
        const response = await getSessionDetailApi(sessionId, scopedSearchParams);
        const detail = response.session;
        setRecap(detail.recap);
        setRecapStatus(detail.artifacts.recap);
        setRecapPhase(detail.recapPhase);
        setSpeakerAttribution(detail.speakerAttribution);
        setActiveTab(resolveDefaultTab(detail.recap));

        // Load annotations + candidates in parallel (non-blocking for recap display)
        const [annotRes, candRes] = await Promise.allSettled([
          getAnnotatedRecapsApi(sessionId, scopedSearchParams),
          getEntityCandidatesApi(sessionId, scopedSearchParams),
        ]);
        if (annotRes.status === "fulfilled") {
          setAnnotations(annotRes.value.annotations);
        }
        if (candRes.status === "fulfilled") {
          setCandidates(candRes.value.candidates);
        }
      } catch (err) {
        if (err instanceof WebApiError && err.status === 404) {
          setRecapStatus("missing");
        } else {
          setError("Unable to load recap for this session.");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [scopedSearchParams],
  );

  useEffect(() => {
    if (!selectedSessionId) {
      setRecap(null);
      setRecapStatus("missing");
      setRecapPhase(null);
      setSpeakerAttribution(null);
      setAnnotations(null);
      setCandidates([]);
      setError(null);
      return;
    }
    void fetchSessionDetail(selectedSessionId);
  }, [selectedSessionId, fetchSessionDetail]);

  const activeRecapText = recap ? recap[activeTab] : "";
  const activeAnnotatedLines = useMemo(() => {
    const tabAnnotation = annotations?.[activeTab];
    return tabAnnotation?.lines ?? null;
  }, [annotations, activeTab]);
  const tabAvailability = useMemo(() => {
    if (!recap) return { concise: false, balanced: false, detailed: false };
    return {
      concise: recap.concise.trim().length > 0,
      balanced: recap.balanced.trim().length > 0,
      detailed: recap.detailed.trim().length > 0,
    };
  }, [recap]);
  const displayTitle = useMemo(() => {
    if (!selectedSession) {
      return null;
    }
    return formatSessionDisplayTitle({
      label: label.trim().length > 0 ? label.trim() : null,
      sessionId: selectedSession.id,
    });
  }, [label, selectedSession]);
  const displayDate = useMemo(() => formatSessionDate(selectedSession?.date), [selectedSession?.date]);
  const debugChips = useMemo(() => {
    if (!verboseModeEnabled || !selectedSession) {
      return [] as Array<{ label: string; tone: StatusChipTone }>;
    }

    const chips: Array<{ label: string; tone: StatusChipTone }> = [
      {
        label:
          selectedSession.status === "in_progress"
            ? "In progress"
            : selectedSession.status === "interrupted"
              ? "Interrupted"
              : "Completed",
        tone:
          selectedSession.status === "in_progress"
            ? "warning"
            : selectedSession.status === "interrupted"
              ? "danger"
              : "neutral",
      },
      ...(selectedSession.isArchived ? [{ label: "Archived", tone: "neutral" as const }] : []),
      ...(selectedSession.sessionOrigin === "lab_legacy" ? [{ label: "Lab legacy", tone: "warning" as const }] : []),
      { label: `Source ${selectedSession.source}`, tone: "info" },
      { label: `Transcript ${selectedSession.artifacts.transcript}`, tone: artifactTone(selectedSession.artifacts.transcript) },
      { label: `Recap ${recapStatus}`, tone: artifactTone(recapStatus) },
      ...(recap?.source ? [{ label: `Recap source ${recap.source}`, tone: "info" as const }] : []),
      ...(recap?.llmModel ? [{ label: recap.llmModel, tone: "info" as const }] : []),
      ...(recap?.strategyVersion || recap?.modelVersion
        ? [{ label: `Strategy ${recap?.strategyVersion ?? recap?.modelVersion}`, tone: "neutral" as const }]
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
  }, [recap, recapStatus, selectedSession, verboseModeEnabled]);

  /* ── No session selected ── */
  if (!selectedSessionId) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <p className="text-muted-foreground text-sm">
          Select a session to read its chronicle.
        </p>
      </div>
    );
  }

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Loading recap</p>
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <p className="text-sm text-rose-400">{error}</p>
      </div>
    );
  }

  /* ── recapPhase-aware pre-recap states ── */
  if (recapPhase === "live") {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground text-sm">
            Session is still active.
          </p>
          <p className="text-muted-foreground/70 text-xs">
            Recap will be available after the session ends.
          </p>
        </div>
      </div>
    );
  }

  if (recapPhase === "ended_pending_attribution" && speakerAttribution) {
    return (
      <div className="flex-1 min-w-0">
        <div className="rounded-[28px] border border-border/70 bg-background/72 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-md">
          <div className="px-4 py-5 sm:px-5 sm:py-6">
            <div className="space-y-2 mb-6">
              <h3 className="font-serif text-xl text-foreground">Recap generation blocked</h3>
              <p className="text-sm text-muted-foreground">
                Every session speaker must be classified before recap generation can proceed.
                {speakerAttribution.pendingCount > 0
                  ? ` ${speakerAttribution.pendingCount} speaker${speakerAttribution.pendingCount === 1 ? " remains" : "s remain"} unclassified.`
                  : ""}
              </p>
            </div>
            <SpeakerAttributionPanel
              sessionId={selectedSessionId!}
              campaignSlug={campaignSlug}
              searchParams={scopedSearchParams}
              canWrite={canWrite}
              initialState={speakerAttribution}
              onBeginRecapGeneration={async () => {
                await regenerateSessionRecapApi(
                  selectedSessionId!,
                  { reason: "chronicle-post-attribution" },
                  scopedSearchParams,
                );
                router.refresh();
                void fetchSessionDetail(selectedSessionId!);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (recapPhase === "ended_ready") {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground text-sm">
            Recap is ready to generate.
          </p>
          <p className="text-muted-foreground/70 text-xs">
            Open the full session to generate or regenerate a recap.
          </p>
        </div>
      </div>
    );
  }

  if (recapPhase === "generating") {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Recap generation in progress</p>
        </div>
      </div>
    );
  }

  if (recapPhase === "failed") {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="text-center space-y-2">
          <p className="text-sm text-rose-400">Recap generation failed.</p>
          <p className="text-muted-foreground/70 text-xs">
            Open the full session to review warnings and retry.
          </p>
        </div>
      </div>
    );
  }

  /* ── Recap missing / not yet generated (fallback for null recapPhase) ── */
  if (recapStatus === "missing" || (recapStatus === "available" && !recap)) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground text-sm">
            No recap has been generated for this session yet.
          </p>
          <p className="text-muted-foreground/70 text-xs">
            Open the full session to generate or regenerate a recap.
          </p>
        </div>
      </div>
    );
  }

  /* ── Recap unavailable (retrieval failure) ── */
  if (recapStatus === "unavailable") {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">
          Recap retrieval failed for this session. Try again later.
        </p>
      </div>
    );
  }

  /* ── Recap content ── */
  return (
    <div className="flex-1 min-w-0">
      <div className="rounded-[28px] border border-border/70 bg-background/72 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-md">
        {verboseModeEnabled ? (
          <div className="flex items-center justify-end border-b border-border/70 px-4 py-2 sm:px-5 sm:py-3">
            <div className="flex rounded-lg border border-border/70 bg-background/50 p-1">
              {TABS.map((tab) => {
                const enabled = tabAvailability[tab.id];
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    disabled={!enabled}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : enabled
                          ? "text-muted-foreground hover:text-foreground"
                          : "text-muted-foreground/40"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <article className="mx-auto max-w-3xl px-4 py-5 sm:px-5 sm:py-6">
          <header className="border-b border-border/50 pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <InlineEditableText
                  value={label}
                  displayValue={displayTitle ?? "Untitled Session"}
                  canEdit={canEditSessionTitle}
                  ariaLabel="Session title"
                  allowEmpty
                  maxLength={80}
                  maxLengthMessage="Session title must be 80 characters or fewer."
                  inputClassName="w-full min-w-[14rem] border-b border-primary/30 bg-transparent px-0 py-0 font-serif text-3xl leading-tight text-foreground outline-none transition-colors focus:border-primary sm:text-4xl"
                  onSave={async (nextValue) => {
                    if (!selectedSessionId) {
                      return label;
                    }

                    const nextLabel = nextValue.length > 0 ? nextValue : null;

                    try {
                      const result = await updateSessionLabelApi(selectedSessionId, { label: nextLabel }, scopedSearchParams);
                      const savedLabel = result.session.label ?? "";
                      setLabel(savedLabel);
                      router.refresh();
                      return savedLabel;
                    } catch (saveError) {
                      if (saveError instanceof WebApiError) {
                        throw new Error(saveError.message);
                      }

                      throw new Error("Unable to update the session title right now.");
                    }
                  }}
                  renderDisplay={({ displayValue, canEdit, isSaving, startEditing }) => (
                    <h2 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={startEditing}
                          disabled={isSaving}
                          className="cursor-text text-left decoration-primary/35 underline-offset-4 transition hover:text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {displayValue}
                        </button>
                      ) : (
                        displayValue
                      )}
                    </h2>
                  )}
                />
                {displayDate ? (
                  <p className="mt-3 text-sm uppercase tracking-[0.22em] text-muted-foreground">
                    {displayDate}
                  </p>
                ) : null}
              </div>

              {debugChips.length > 0 ? (
                <div className="flex max-w-xs flex-wrap justify-end gap-2 pt-1">
                  {debugChips.map((chip) => (
                    <StatusChip key={chip.label} label={chip.label} tone={chip.tone} />
                  ))}
                </div>
              ) : null}
            </div>
          </header>

          <div className="pt-8">
            <AnnotatedRecapRenderer
              annotatedLines={activeAnnotatedLines}
              text={activeRecapText}
              campaignSlug={campaignSlug}
              searchParams={scopedSearchParams}
              candidates={candidates}
              registry={registry}
            />
          </div>

          {verboseModeEnabled && recap?.generatedAt ? (
            <footer className="mt-8 border-t border-border/50 pt-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Generated {new Date(recap.generatedAt).toLocaleString()}
            </footer>
          ) : null}
        </article>
      </div>
    </div>
  );
}
