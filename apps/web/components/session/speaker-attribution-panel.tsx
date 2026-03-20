"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSessionSpeakerAttributionApi } from "@/lib/api/sessions";
import { WebApiError } from "@/lib/api/http";
import type { SpeakerAttributionBatchRequest } from "@/lib/api/types";
import type { SessionSpeakerAttributionState } from "@/lib/types";

type SpeakerAttributionPanelProps = {
  sessionId: string;
  campaignSlug: string;
  searchParams?: Record<string, string | string[] | undefined>;
  canWrite: boolean;
  initialState: SessionSpeakerAttributionState;
  onBeginRecapGeneration: () => Promise<void>;
};

type BannerState = {
  tone: "success" | "danger";
  message: string;
} | null;

type DraftRow = {
  classificationType: "" | "pc" | "ignore";
  pcEntityId: string;
  createMode: boolean;
  createCanonicalName: string;
  createAliases: string;
  createNotes: string;
};

const CREATE_PC_OPTION = "__create_new_pc__";

function mapError(error: unknown): string {
  if (error instanceof WebApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unable to save speaker attribution right now.";
}

function buildDrafts(state: SessionSpeakerAttributionState): Record<string, DraftRow> {
  return Object.fromEntries(
    state.speakers.map((speaker) => [
      speaker.discordUserId,
      {
        classificationType:
          speaker.classification?.classificationType === "pc"
            ? "pc"
            : speaker.classification?.classificationType === "ignore"
              ? "ignore"
              : "",
        pcEntityId: speaker.classification?.pcEntityId ?? "",
        createMode: false,
        createCanonicalName: "",
        createAliases: "",
        createNotes: "",
      },
    ])
  );
}

function hasIncompleteRows(state: SessionSpeakerAttributionState, drafts: Record<string, DraftRow>): boolean {
  return state.speakers.some((speaker) => {
    if (speaker.classification?.locked) {
      return false;
    }

    const draft = drafts[speaker.discordUserId];
    if (!draft) {
      return true;
    }

    if (draft.classificationType === "ignore") {
      return false;
    }

    if (draft.classificationType === "pc") {
      if (draft.createMode) {
        return draft.createCanonicalName.trim().length === 0;
      }
      return draft.pcEntityId.trim().length === 0;
    }

    return true;
  });
}

export function SpeakerAttributionPanel({
  sessionId,
  campaignSlug,
  searchParams,
  canWrite,
  initialState,
  onBeginRecapGeneration,
}: SpeakerAttributionPanelProps) {
  const router = useRouter();
  const [attribution, setAttribution] = useState(initialState);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>(() => buildDrafts(initialState));
  const [banner, setBanner] = useState<BannerState>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setAttribution(initialState);
    setDrafts(buildDrafts(initialState));
    setBanner(null);
  }, [initialState]);

  async function persistDrafts(): Promise<SessionSpeakerAttributionState> {
    const entries: SpeakerAttributionBatchRequest["entries"] = [];
    for (const speaker of attribution.speakers) {
      if (speaker.classification?.locked) {
        continue;
      }

      const draft = drafts[speaker.discordUserId];
      if (!draft || draft.classificationType === "") {
        continue;
      }

      if (draft.classificationType === "ignore") {
        entries.push({ discordUserId: speaker.discordUserId, classificationType: "ignore" });
        continue;
      }

      entries.push({
        discordUserId: speaker.discordUserId,
        classificationType: "pc",
        ...(draft.createMode
          ? {
              createPc: {
                canonicalName: draft.createCanonicalName.trim(),
                aliases: draft.createAliases
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
                notes: draft.createNotes.trim() || undefined,
              },
            }
          : {
              pcEntityId: draft.pcEntityId.trim(),
            }),
      });
    }

    const payload: SpeakerAttributionBatchRequest = { entries };

    if (payload.entries.length === 0) {
      return attribution;
    }

    const response = await saveSessionSpeakerAttributionApi(sessionId, payload, {
      ...searchParams,
      campaign_slug: campaignSlug,
    });
    setAttribution(response.speakerAttribution);
    setDrafts(buildDrafts(response.speakerAttribution));
    return response.speakerAttribution;
  }

  async function handleSaveProgress() {
    setIsSaving(true);
    setBanner(null);
    try {
      const saved = await persistDrafts();
      if (saved.ready) {
        router.refresh();
        return;
      }

      setBanner({
        tone: "success",
        message: "Speaker classifications saved.",
      });
    } catch (error) {
      setBanner({ tone: "danger", message: mapError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveAndBeginRecap() {
    if (hasIncompleteRows(attribution, drafts)) {
      setBanner({ tone: "danger", message: "Every speaker must be classified before recap generation can begin." });
      return;
    }

    setIsSaving(true);
    setIsGenerating(true);
    setBanner(null);
    try {
      const saved = await persistDrafts();
      if (!saved.ready) {
        setBanner({
          tone: "danger",
          message: "Speaker attribution is still incomplete. Save the remaining rows, then try again.",
        });
        return;
      }

      await onBeginRecapGeneration();
    } catch (error) {
      setBanner({ tone: "danger", message: mapError(error) });
    } finally {
      setIsSaving(false);
      setIsGenerating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-background/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-serif text-lg">Attribution needed</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Classify each unresolved transcript speaker before recap generation can begin.
          </p>
        </div>
        <div className="rounded-full border border-border/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {`${attribution.pendingCount} pending`}
        </div>
      </div>

      {!canWrite ? (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          Only the campaign DM can classify speakers and begin recap generation.
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {attribution.speakers.map((speaker) => {
          const draft = drafts[speaker.discordUserId];
          const locked = Boolean(speaker.classification?.locked);

          return (
            <div key={speaker.discordUserId} className="rounded-xl border border-border/60 bg-background/35 p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{speaker.displayName}</p>
                  </div>
                  {locked ? (
                    <p className="mt-2 text-sm text-emerald-200">DM is auto-classified and locked.</p>
                  ) : draft.classificationType === "pc" ? (
                    <div className="mt-3 space-y-2">
                      <select
                        value={draft.createMode ? CREATE_PC_OPTION : draft.pcEntityId}
                        onChange={(event) => {
                          const nextValue = event.currentTarget.value;
                          setDrafts((current) => ({
                            ...current,
                            [speaker.discordUserId]: {
                              ...draft,
                              createMode: nextValue === CREATE_PC_OPTION,
                              pcEntityId: nextValue === CREATE_PC_OPTION ? "" : nextValue,
                            },
                          }));
                        }}
                        disabled={!canWrite}
                        className="control-select w-full rounded-md px-3 py-2 text-sm"
                      >
                        <option value="">Select PC</option>
                        {attribution.availablePcs.map((pc) => (
                          <option key={pc.id} value={pc.id}>
                            {pc.canonicalName}
                          </option>
                        ))}
                        <option value={CREATE_PC_OPTION}>Create new PC</option>
                      </select>
                      {draft.createMode ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          <input
                            value={draft.createCanonicalName}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setDrafts((current) => ({
                                ...current,
                                [speaker.discordUserId]: {
                                  ...draft,
                                  createCanonicalName: value,
                                },
                              }));
                            }}
                            placeholder="Canonical PC name"
                            className="control-input rounded-md px-3 py-2 text-sm"
                            disabled={!canWrite}
                          />
                          <input
                            value={draft.createAliases}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setDrafts((current) => ({
                                ...current,
                                [speaker.discordUserId]: {
                                  ...draft,
                                  createAliases: value,
                                },
                              }));
                            }}
                            placeholder="Aliases, comma-separated"
                            className="control-input rounded-md px-3 py-2 text-sm"
                            disabled={!canWrite}
                          />
                          <input
                            value={draft.createNotes}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setDrafts((current) => ({
                                ...current,
                                [speaker.discordUserId]: {
                                  ...draft,
                                  createNotes: value,
                                },
                              }));
                            }}
                            placeholder="Optional notes"
                            className="control-input rounded-md px-3 py-2 text-sm md:col-span-2"
                            disabled={!canWrite}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : draft.classificationType === "ignore" ? (
                    <p className="mt-2 text-sm text-muted-foreground">This speaker will be excluded from recap attribution.</p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Choose whether this speaker maps to a PC or should be ignored.</p>
                  )}
                </div>

                <div>
                  {locked ? (
                    <div className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-200">
                      DM
                    </div>
                  ) : (
                    <select
                      value={draft.classificationType}
                      onChange={(event) => {
                        const value = event.currentTarget.value as DraftRow["classificationType"];
                        setDrafts((current) => ({
                          ...current,
                          [speaker.discordUserId]: {
                            ...draft,
                            classificationType: value,
                            createMode: value === "pc" ? draft.createMode : false,
                            pcEntityId: value === "pc" ? draft.pcEntityId : "",
                          },
                        }));
                      }}
                      disabled={!canWrite}
                      className="control-select w-full rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Select classification</option>
                      <option value="pc">PC</option>
                      <option value="ignore">Not directly involved</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSaveProgress}
          disabled={!canWrite || isSaving || isGenerating}
          className="rounded-full border border-border bg-background/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving && !isGenerating ? "Saving" : "Save progress"}
        </button>
        <button
          type="button"
          onClick={handleSaveAndBeginRecap}
          disabled={!canWrite || isSaving || isGenerating}
          className="rounded-full button-primary px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? "Starting recap" : "Save and begin recap generation"}
        </button>
      </div>

      {banner ? (
        <div
          className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
            banner.tone === "success"
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
              : "border-rose-400/40 bg-rose-400/10 text-rose-200"
          }`}
        >
          {banner.message}
        </div>
      ) : null}
    </div>
  );
}