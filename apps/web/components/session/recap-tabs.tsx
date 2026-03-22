"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityPreviewPanel } from "@/components/session/entity-preview-panel";
import { SpeakerAttributionPanel } from "@/components/session/speaker-attribution-panel";
import { regenerateSessionRecapApi, getAnnotatedRecapsApi } from "@/lib/api/sessions";
import { WebApiError } from "@/lib/api/http";
import type {
  RecapTab,
  SessionArtifactStatus,
  SessionRecapPhase,
  SessionRecap,
  SessionAnnotatedRecaps,
  AnnotatedRecapLine,
  SessionSpeakerAttributionState,
} from "@/lib/types";
import type { RegistryCategoryKey } from "@/lib/registry/types";

const HOVER_OPEN_DELAY_MS = 180;
const HOVER_CLOSE_DELAY_MS = 120;

type PreviewEntityState = {
  entityId: string;
  entityName: string;
  category: RegistryCategoryKey;
  anchorRect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
};

const TABS: Array<{ id: RecapTab; label: string }> = [
  { id: "concise", label: "Concise" },
  { id: "balanced", label: "Balanced" },
  { id: "detailed", label: "Detailed" },
];

type RecapTabsProps = {
  recap: SessionRecap | null;
  recapPhase: SessionRecapPhase;
  sessionId: string;
  sessionTitle: string;
  campaignSlug: string;
  speakerAttribution: SessionSpeakerAttributionState | null;
  searchParams?: Record<string, string | string[] | undefined>;
  canRegenerate: boolean;
  canWrite?: boolean;
  showRegenerateUnavailableBanner?: boolean;
  status?: SessionArtifactStatus;
  emptyDescription?: string;
  warnings?: string[];
  annotationVersion?: number;
};

type BannerState =
  | { tone: "success"; message: string }
  | { tone: "danger"; message: string }
  | null;

function mapRegenerateError(error: unknown): string {
  if (error instanceof WebApiError) {
    if (error.code === "RECAP_SPEAKER_ATTRIBUTION_REQUIRED") {
      return "Recap generation is blocked until every session speaker has been classified.";
    }
    if (error.code === "unauthorized") {
      return "Only the configured DM can regenerate recaps for this guild archive.";
    }
    if (error.code === "not_found") {
      return "This session is no longer available for regeneration.";
    }
    if (error.code === "ambiguous_session_scope") {
      return "The session scope is ambiguous and cannot be used for regeneration.";
    }
    if (error.code === "recap_unavailable") {
      return "Recap is unavailable for this session.";
    }
    if (error.code === "recap_in_progress") {
      return "A recap job is already running for this session. Wait for it to finish, then refresh.";
    }
    if (error.code === "recap_rate_limited") {
      return "That recap was requested very recently. Wait a moment before trying again.";
    }
    if (error.code === "recap_capacity_reached") {
      return "Recap generation is currently at capacity. Please retry shortly.";
    }
    if (error.code === "transcript_unavailable") {
      return "Recap generation needs transcript data, but transcript lines are currently unavailable.";
    }
    if (error.code === "recap_invalid_output") {
      return "Recap generation returned incomplete output. Please retry in a moment.";
    }
    if (error.code === "generation_failed") {
      return "Recap generation failed this time. Please try again in a moment.";
    }
    if (
      error.code === "llm_unconfigured" ||
      error.code === "openai_unconfigured" ||
      error.code === "anthropic_unconfigured" ||
      error.code === "google_unconfigured"
    ) {
      return "Recap regeneration is unavailable until the selected LLM provider is configured on the server.";
    }
    if (error.code === "discord_refresh_unconfigured") {
        return "This environment is missing Discord refresh configuration required by generation dependencies.";
    }

    if (error.code === "invalid_request") {
      return error.message;
    }

    if (error.code === "conflict") {
      return error.message;
    }

    if (error.message && error.message.trim().length > 0) {
      return `Recap regeneration failed (${error.code}): ${error.message}`;
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

function toRecapTxt(args: {
  recap: SessionRecap | null;
  sessionId: string;
  sessionTitle: string;
  campaignSlug: string;
}): string {
  const title = args.sessionTitle.trim().length > 0 ? args.sessionTitle : "Untitled Session";
  if (!args.recap) {
    return `Session: ${title}\nSession ID: ${args.sessionId}\nCampaign: ${args.campaignSlug}\n\nNo recap available.`;
  }

  const displayModel = args.recap.llmModel?.trim() || "Unknown";

  return [
    `Session: ${title}`,
    `Session ID: ${args.sessionId}`,
    `Campaign: ${args.campaignSlug}`,
    `Generated At: ${args.recap.generatedAt}`,
    `Model: ${displayModel}`,
    `Strategy: ${args.recap.strategyVersion ?? args.recap.modelVersion}`,
    "",
    "[Concise]",
    args.recap.concise,
    "",
    "[Balanced]",
    args.recap.balanced,
    "",
    "[Detailed]",
    args.recap.detailed,
  ].join("\n");
}

function resolveDefaultTab(recap: SessionRecap | null): RecapTab {
  if (!recap) return "balanced";
  if (recap.balanced.trim().length > 0) return "balanced";
  if (recap.concise.trim().length > 0) return "concise";
  if (recap.detailed.trim().length > 0) return "detailed";
  return "balanced";
}

import { normalizeRecapLines } from "@/lib/shared/normalizeRecapLines";

function getAnchorRect(target: HTMLElement): PreviewEntityState["anchorRect"] {
  const rect = target.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

export function RecapTabs({
  recap,
  recapPhase,
  sessionId,
  sessionTitle,
  campaignSlug,
  speakerAttribution,
  searchParams,
  canRegenerate,
  canWrite = false,
  showRegenerateUnavailableBanner = true,
  status = "available",
  emptyDescription,
  warnings = [],
  annotationVersion = 0,
}: RecapTabsProps) {
  const router = useRouter();
  const recapDisplayModel = recap ? (recap.llmModel?.trim() || "Unknown") : null;
  const [activeTab, setActiveTab] = useState<RecapTab>(resolveDefaultTab(recap));
  const [isPending, setIsPending] = useState(false);
  const [banner, setBanner] = useState<BannerState>(
    canRegenerate || !showRegenerateUnavailableBanner
      ? null
      : {
          tone: "danger",
          message: canWrite
            ? "Recap regeneration is currently unavailable for this session."
            : "Only the configured DM can regenerate recaps for this guild archive.",
        }
  );

  // Annotation state
  const [annotations, setAnnotations] = useState<SessionAnnotatedRecaps | null>(null);
  const [hoverPreviewEntity, setHoverPreviewEntity] = useState<PreviewEntityState | null>(null);
  const [pinnedPreviewEntity, setPinnedPreviewEntity] = useState<PreviewEntityState | null>(null);
  const hoverOpenTimerRef = useRef<number | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);

  const scopedSearchParams = useMemo(
    () => ({
      ...searchParams,
      campaign_slug: campaignSlug,
    }),
    [campaignSlug, searchParams]
  );

  const loadAnnotations = useCallback(async () => {
    if (!recap) return;
    try {
      const result = await getAnnotatedRecapsApi(sessionId, scopedSearchParams);
      setAnnotations(result.annotations ?? null);
    } catch {
      // Non-fatal — annotations are optional enrichment
    }
  }, [sessionId, recap, scopedSearchParams]);

  useEffect(() => {
    loadAnnotations();
  }, [annotationVersion, loadAnnotations]);

  useEffect(() => {
    return () => {
      if (hoverOpenTimerRef.current !== null) {
        window.clearTimeout(hoverOpenTimerRef.current);
      }
      if (hoverCloseTimerRef.current !== null) {
        window.clearTimeout(hoverCloseTimerRef.current);
      }
    };
  }, []);

  const availableTabs = useMemo(() => {
    if (!recap) {
      return {
        concise: false,
        balanced: false,
        detailed: false,
      } as const;
    }

    return {
      concise: recap.concise.trim().length > 0,
      balanced: recap.balanced.trim().length > 0,
      detailed: recap.detailed.trim().length > 0,
    } as const;
  }, [recap]);

  async function performRegenerateRecap(): Promise<void> {
    setIsPending(true);
    setBanner(null);
    try {
      await regenerateSessionRecapApi(
        sessionId,
        { reason: "manual-web-regenerate" },
        scopedSearchParams
      );
      setBanner({
        tone: "success",
        message: "Recap regenerated successfully.",
      });
      await loadAnnotations();
      router.refresh();
    } catch (error) {
      const message = mapRegenerateError(error);
      setBanner({
        tone: "danger",
        message,
      });
      throw error instanceof Error ? error : new Error(message);
    } finally {
      setIsPending(false);
    }
  }

  function handleRegenerateRecap(): void {
    void performRegenerateRecap().catch(() => {
      // Banner state is already updated inside performRegenerateRecap.
    });
  }

  const recapBaseName = `${campaignSlug}-${sessionId}-recap`;
  const activeRecapText = recap ? recap[activeTab] : "";
  const activeRecapLines = useMemo(() => normalizeRecapLines(activeRecapText), [activeRecapText]);
  const activeAnnotatedLines: AnnotatedRecapLine[] | null = useMemo(() => {
    const tabAnnotation = annotations?.[activeTab];
    return tabAnnotation?.lines ?? null;
  }, [annotations, activeTab]);
  const isTabEnabled = (tab: RecapTab) => availableTabs[tab];
  const activePreviewEntity = pinnedPreviewEntity ?? hoverPreviewEntity;
  const shouldShowLegacyNotice = Boolean(
    recap
    && recap.source
    && recap.source !== "canonical"
    && activeRecapText.trim().length > 0
  );
  const allowRegenerateAction = recapPhase === "ended_ready" || recapPhase === "complete" || recapPhase === "failed";
  const allowDownloadAction = recapPhase === "complete" && Boolean(recap);
  const recapPhaseSubtitle =
    recapPhase === "ended_pending_attribution"
      ? "Awaiting speaker attribution"
      : recapPhase === "ended_ready"
        ? "Ready for generation"
        : recapPhase === "generating"
          ? "Generation in progress"
          : recapPhase === "failed"
            ? "Generation failed"
            : recapPhase === "live"
              ? "Unavailable during live session"
              : `Recap ${status}`;

  function clearHoverOpenTimer() {
    if (hoverOpenTimerRef.current !== null) {
      window.clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
  }

  function clearHoverCloseTimer() {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }

  function buildPreviewEntity(
    target: HTMLElement,
    entityId: string,
    entityName: string,
    category: RegistryCategoryKey
  ): PreviewEntityState {
    return {
      entityId,
      entityName,
      category,
      anchorRect: getAnchorRect(target),
    };
  }

  function scheduleHoverClose() {
    clearHoverCloseTimer();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setHoverPreviewEntity(null);
      hoverCloseTimerRef.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  }

  function handleEntityMouseEnter(
    target: HTMLElement,
    entityId: string,
    entityName: string,
    category: RegistryCategoryKey
  ) {
    if (pinnedPreviewEntity) return;
    clearHoverCloseTimer();
    clearHoverOpenTimer();

    const preview = buildPreviewEntity(target, entityId, entityName, category);
    hoverOpenTimerRef.current = window.setTimeout(() => {
      setHoverPreviewEntity(preview);
      hoverOpenTimerRef.current = null;
    }, HOVER_OPEN_DELAY_MS);
  }

  function handleEntityMouseLeave() {
    if (pinnedPreviewEntity) return;
    clearHoverOpenTimer();
    scheduleHoverClose();
  }

  function handleEntityClick(
    target: HTMLElement,
    entityId: string,
    entityName: string,
    category: RegistryCategoryKey
  ) {
    clearHoverOpenTimer();
    clearHoverCloseTimer();

    const preview = buildPreviewEntity(target, entityId, entityName, category);
    setHoverPreviewEntity(preview);
    setPinnedPreviewEntity((current) => {
      if (current && current.entityId === entityId) {
        return null;
      }
      return preview;
    });
  }

  function handlePreviewMouseEnter() {
    clearHoverCloseTimer();
  }

  function handlePreviewMouseLeave() {
    if (pinnedPreviewEntity) return;
    scheduleHoverClose();
  }

  function handlePreviewClose() {
    clearHoverOpenTimer();
    clearHoverCloseTimer();
    setHoverPreviewEntity(null);
    setPinnedPreviewEntity(null);
  }

  return (
    <div className="rounded-2xl card-glass">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="space-y-1">
          <h3 className="font-serif text-lg">Recap</h3>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {recapDisplayModel ? `Model ${recapDisplayModel}` : recapPhaseSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-background/50 p-1">
            {TABS.map((tab) => {
              const enabled = isTabEnabled(tab.id);
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  title={enabled && recapPhase === "complete" ? tab.label : "This recap style is unavailable"}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                    activeTab === tab.id && recapPhase === "complete"
                      ? "bg-primary text-primary-foreground"
                      : enabled && recapPhase === "complete"
                        ? "text-muted-foreground hover:text-foreground"
                        : "text-muted-foreground/40"
                  }`}
                  disabled={recapPhase !== "complete"}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={handleRegenerateRecap}
            disabled={isPending || !canRegenerate || !allowRegenerateAction}
            title={canRegenerate && allowRegenerateAction ? "Regenerate recap" : "Recap regeneration is unavailable"}
            className="inline-flex items-center gap-2 rounded-full button-primary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
            {isPending ? "Regenerating" : recapPhase === "ended_ready" ? "Generate" : "Regenerate"}
          </button>
          <button
            type="button"
            onClick={() =>
              triggerDownload(
                `${recapBaseName}.txt`,
                toRecapTxt({ recap, sessionId, sessionTitle, campaignSlug }),
                "text/plain;charset=utf-8"
              )
            }
            disabled={!allowDownloadAction}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>
      </div>
      <div className="space-y-4 p-6">
        {recapPhase === "complete" && recap ? (
          <>
            {activeRecapLines.length > 0 ? (
              <>
                <div className="space-y-2 text-sm leading-relaxed text-foreground/90">
                  {activeAnnotatedLines
                    ? activeAnnotatedLines.map((line, index) => (
                        <div key={`${activeTab}-annotated-${index}`} className="flex gap-2">
                          <span className="text-amber-400">✦</span>
                          <span>
                            {line.spans.map((span, si) =>
                              span.type === "entity" ? (
                                <button
                                  key={si}
                                  type="button"
                                  onMouseEnter={(event) =>
                                    handleEntityMouseEnter(
                                      event.currentTarget,
                                      span.entityId,
                                      span.text,
                                      span.category
                                    )
                                  }
                                  onMouseLeave={handleEntityMouseLeave}
                                  onClick={(event) =>
                                    handleEntityClick(
                                      event.currentTarget,
                                      span.entityId,
                                      span.text,
                                      span.category
                                    )
                                  }
                                  className="text-amber-400 font-semibold hover:text-amber-300 hover:underline cursor-pointer"
                                >
                                  {span.text}
                                </button>
                              ) : (
                                <span key={si}>{span.text}</span>
                              )
                            )}
                          </span>
                        </div>
                      ))
                    : activeRecapLines.map((line, index) => (
                        <div key={`${activeTab}-${index}`} className="flex gap-2">
                          <span className="text-amber-400">✦</span>
                          <span>{line}</span>
                        </div>
                      ))}
                </div>
                <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                  Generated {new Date(recap.generatedAt).toLocaleString()}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">No recap exists in this style yet.</p>
                <p className="text-sm text-muted-foreground">Hit regenerate to create it.</p>
              </>
            )}
            {shouldShowLegacyNotice ? (
              <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                This recap was loaded from a legacy store ({recap.source}). Regenerate recap to canonicalize it.
              </div>
            ) : null}
          </>
        ) : recapPhase === "ended_pending_attribution" && speakerAttribution ? (
          <SpeakerAttributionPanel
            sessionId={sessionId}
            campaignSlug={campaignSlug}
            searchParams={searchParams}
            canWrite={canWrite}
            initialState={speakerAttribution}
            onBeginRecapGeneration={performRegenerateRecap}
          />
        ) : recapPhase === "ended_ready" ? (
          <EmptyState
            title="Recap ready to generate"
            description={emptyDescription ?? "Speaker attribution is complete. Generate the recap when you're ready."}
          />
        ) : recapPhase === "generating" ? (
          <EmptyState
            title="Recap generating"
            description="Recap generation is currently in progress. Refresh this page in a moment."
          />
        ) : recapPhase === "failed" ? (
          <EmptyState
            title="Recap generation failed"
            description={warnings[0] ?? emptyDescription ?? "The last recap attempt failed. Review warnings, then try again."}
          />
        ) : (
          <EmptyState
            title={recapPhase === "live" ? "Recap unavailable during live session" : status === "missing" ? "No recap yet" : "Recap unavailable"}
            description={emptyDescription ?? "No recap is currently available for this session."}
          />
        )}
        {warnings.length > 0 ? (
          <p className="text-xs text-amber-200/90">Warnings: {warnings[0]}</p>
        ) : null}
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
      </div>

      {/* Entity preview side panel */}
      {activePreviewEntity && (
        <EntityPreviewPanel
          entityId={activePreviewEntity.entityId}
          entityName={activePreviewEntity.entityName}
          category={activePreviewEntity.category}
          campaignSlug={campaignSlug}
          anchorRect={activePreviewEntity.anchorRect}
          isPinned={Boolean(pinnedPreviewEntity)}
          searchParams={searchParams}
          onMouseEnter={handlePreviewMouseEnter}
          onMouseLeave={handlePreviewMouseLeave}
          onClose={handlePreviewClose}
        />
      )}
    </div>
  );
}
