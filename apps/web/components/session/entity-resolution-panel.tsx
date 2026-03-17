"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCampaignRegistryApi } from "@/lib/api/registry";
import {
  getEntityCandidatesApi,
  getEntityReviewBatchesApi,
  revertEntityReviewBatchApi,
  saveEntityReviewBatchApi,
} from "@/lib/api/sessions";
import type {
  EntityCandidateDto,
  EntityResolutionAction,
  EntityResolutionDto,
  EntityReviewBatchDto,
  EntityReviewDecision,
  RegistryCategoryKey,
  RegistryEntityDto,
} from "@/lib/registry/types";
import { StatusChip } from "@/components/shared/status-chip";

type Props = {
  sessionId: string;
  campaignSlug: string;
  searchParams?: Record<string, string | string[] | undefined>;
  canWrite: boolean;
  onResolutionChange?: () => void;
};

type BannerState =
  | { tone: "success"; message: string }
  | { tone: "danger"; message: string }
  | null;

const CATEGORY_OPTIONS: Array<{ value: RegistryCategoryKey; label: string }> = [
  { value: "npcs", label: "NPC" },
  { value: "pcs", label: "PC" },
  { value: "locations", label: "Location" },
  { value: "factions", label: "Faction" },
  { value: "misc", label: "Misc" },
];

const ACTION_LABELS: Record<EntityResolutionAction, string> = {
  resolve_existing: "Linked",
  create_entity: "Created",
  add_alias: "Aliased",
  ignore_candidate: "Ignored",
};

const CATEGORY_LABELS: Record<RegistryCategoryKey, string> = {
  pcs: "PC",
  npcs: "NPC",
  locations: "Location",
  factions: "Faction",
  misc: "Misc",
};

function buildResolutionSummary(args: {
  action: EntityResolutionAction;
  candidateName: string;
  category?: RegistryCategoryKey | null;
  targetName?: string | null;
}): string {
  const categoryLabel = args.category ? CATEGORY_LABELS[args.category] : null;

  switch (args.action) {
    case "resolve_existing":
      return `Linked ${args.candidateName} to ${categoryLabel ? `${categoryLabel} ` : ""}${args.targetName ?? "entity"}.`;
    case "add_alias":
      return `Aliased ${args.candidateName} into ${categoryLabel ? `${categoryLabel} ` : ""}${args.targetName ?? "entity"}.`;
    case "create_entity":
      if (!args.targetName || args.targetName === args.candidateName) {
        return `Created ${categoryLabel ? `${categoryLabel} ` : ""}${args.candidateName}.`;
      }
      return `Created ${categoryLabel ? `${categoryLabel} ` : ""}${args.targetName} from ${args.candidateName}.`;
    case "ignore_candidate":
      return `Ignored ${args.candidateName}.`;
  }
}

function resolveSummaryText(
  resolution: EntityResolutionDto,
  registryEntities: RegistryEntityDto[]
): string {
  const targetName = resolution.entityId
    ? registryEntities.find((entity) => entity.id === resolution.entityId)?.canonicalName ?? null
    : null;

  if (targetName || resolution.action === "ignore_candidate") {
    return buildResolutionSummary({
      action: resolution.action,
      candidateName: resolution.candidateName,
      category: resolution.entityCategory,
      targetName,
    });
  }

  if (resolution.summary.trim().length > 0) {
    return resolution.summary;
  }

  return buildResolutionSummary({
    action: resolution.action,
    candidateName: resolution.candidateName,
    category: resolution.entityCategory,
  });
}

function buildMentionPreview(example: string, candidateName: string): {
  prefix: string;
  match: string;
  suffix: string;
} {
  const lowerExample = example.toLowerCase();
  const lowerCandidate = candidateName.toLowerCase();
  const matchIndex = lowerExample.indexOf(lowerCandidate);
  if (matchIndex === -1) {
    const clipped = example.length > 120 ? `${example.slice(0, 117)}...` : example;
    return { prefix: clipped, match: "", suffix: "" };
  }

  const matchEnd = matchIndex + candidateName.length;
  const start = Math.max(0, matchIndex - 48);
  const end = Math.min(example.length, matchEnd + 48);

  return {
    prefix: `${start > 0 ? "..." : ""}${example.slice(start, matchIndex)}`,
    match: example.slice(matchIndex, matchEnd),
    suffix: `${example.slice(matchEnd, end)}${end < example.length ? "..." : ""}`,
  };
}

function resolutionTone(action: EntityResolutionAction): "success" | "warning" | "neutral" {
  if (action === "ignore_candidate") {
    return "neutral";
  }

  return action === "create_entity" ? "warning" : "success";
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
    .replace(/\s+/g, " ");
}

function makeDraftResolution(args: {
  candidateName: string;
  resolution: EntityResolutionDto["resolution"];
  action: EntityResolutionAction;
  summary: string;
  entityId: string | null;
  entityCategory: RegistryCategoryKey | null;
}): EntityResolutionDto {
  return {
    id: `draft:${args.candidateName}`,
    candidateName: args.candidateName,
    resolution: args.resolution,
    action: args.action,
    summary: args.summary,
    entityId: args.entityId,
    entityCategory: args.entityCategory,
    batchId: null,
    resolvedAt: new Date().toISOString(),
  };
}

export function EntityResolutionPanel({
  sessionId,
  campaignSlug,
  searchParams,
  canWrite,
  onResolutionChange,
}: Props) {
  const [candidates, setCandidates] = useState<EntityCandidateDto[]>([]);
  const [registryEntities, setRegistryEntities] = useState<RegistryEntityDto[]>([]);
  const [batches, setBatches] = useState<EntityReviewBatchDto[]>([]);
  const [draftDecisions, setDraftDecisions] = useState<EntityReviewDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<BannerState>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [revertingBatchId, setRevertingBatchId] = useState<string | null>(null);

  const [createTarget, setCreateTarget] = useState<string | null>(null);
  const [createCategory, setCreateCategory] = useState<RegistryCategoryKey>("npcs");
  const [createName, setCreateName] = useState("");

  const scopedParams = useMemo(
    () => ({ ...searchParams, campaign_slug: campaignSlug }),
    [campaignSlug, searchParams]
  );

  const loadCandidates = useCallback(async () => {
    const result = await getEntityCandidatesApi(sessionId, scopedParams);
    setCandidates(result.candidates);
  }, [scopedParams, sessionId]);

  const loadRegistryEntities = useCallback(async () => {
    if (!canWrite) {
      setRegistryEntities([]);
      return;
    }

    const result = await getCampaignRegistryApi(campaignSlug, scopedParams);
    setRegistryEntities(Object.values(result.registry.categories).flat());
  }, [campaignSlug, canWrite, scopedParams]);

  const loadBatches = useCallback(async () => {
    const result = await getEntityReviewBatchesApi(sessionId, scopedParams);
    setBatches(result.batches);
  }, [scopedParams, sessionId]);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    setBanner(null);
    try {
      await Promise.all([loadCandidates(), loadRegistryEntities(), loadBatches()]);
    } catch {
      setBanner({ tone: "danger", message: "Failed to load entity review state." });
    } finally {
      setLoading(false);
    }
  }, [loadBatches, loadCandidates, loadRegistryEntities]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  const applyResolutionLocally = useCallback(
    (candidateName: string, resolution: EntityResolutionDto) => {
      setCandidates((current) =>
        current.map((candidate) =>
          candidate.candidateName === candidateName
            ? {
                ...candidate,
                resolution,
              }
            : candidate
        )
      );
    },
    []
  );

  const recordDraftDecision = useCallback((decision: EntityReviewDecision, resolution: EntityResolutionDto) => {
    setDraftDecisions((current) => {
      const next = current.filter((item) => item.candidateName !== decision.candidateName);
      next.push(decision);
      return next;
    });
    applyResolutionLocally(decision.candidateName, resolution);
    setBanner(null);
  }, [applyResolutionLocally]);

  const undoDraftDecision = useCallback((candidateName: string) => {
    setDraftDecisions((current) => current.filter((item) => item.candidateName !== candidateName));
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.candidateName === candidateName
          ? {
              ...candidate,
              resolution: null,
            }
          : candidate
      )
    );
    if (createTarget === candidateName) {
      setCreateTarget(null);
      setCreateName("");
    }
    setBanner(null);
  }, [createTarget]);

  const unresolvedCount = candidates.filter((candidate) => !candidate.resolution).length;
  const resolvedCount = candidates.length - unresolvedCount;
  const unsavedCount = draftDecisions.length;
  const recentResolutions = [...candidates]
    .filter((candidate) => candidate.resolution)
    .sort((left, right) => {
      const leftAt = left.resolution ? Date.parse(left.resolution.resolvedAt) : 0;
      const rightAt = right.resolution ? Date.parse(right.resolution.resolvedAt) : 0;
      return rightAt - leftAt;
    })
    .slice(0, 3);

  const filteredRegistryMatches = useMemo(() => {
    const query = createName.trim().toLowerCase();
    if (!createTarget || query.length === 0) return [] as RegistryEntityDto[];

    return registryEntities
      .filter((entity) => {
        if (entity.canonicalName.toLowerCase().includes(query)) return true;
        if (entity.id.toLowerCase().includes(query)) return true;
        if (entity.aliases.some((alias) => alias.toLowerCase().includes(query))) return true;
        if (entity.notes.toLowerCase().includes(query)) return true;
        return false;
      })
      .slice(0, 6);
  }, [createName, createTarget, registryEntities]);

  function collapseToSummaryCard() {
    setIsExpanded(false);
    setCreateTarget(null);
    setCreateName("");
  }

  function handleResolve(
    candidateName: string,
    entityId: string,
    category: RegistryCategoryKey,
    targetName: string
  ) {
    recordDraftDecision(
      {
        type: "resolve_existing",
        candidateName,
        entityId,
      },
      makeDraftResolution({
        candidateName,
        resolution: "resolved",
        action: "resolve_existing",
        summary: buildResolutionSummary({
          action: "resolve_existing",
          candidateName,
          category,
          targetName,
        }),
        entityId,
        entityCategory: category,
      })
    );
  }

  function handleAddAlias(
    candidateName: string,
    entityId: string,
    category: RegistryCategoryKey,
    targetName: string
  ) {
    recordDraftDecision(
      {
        type: "add_alias",
        candidateName,
        entityId,
      },
      makeDraftResolution({
        candidateName,
        resolution: "resolved",
        action: "add_alias",
        summary: buildResolutionSummary({
          action: "add_alias",
          candidateName,
          category,
          targetName,
        }),
        entityId,
        entityCategory: category,
      })
    );
  }

  function handleCreate(candidateName: string, aliasTarget: RegistryEntityDto | undefined) {
    const submittedName = createName.trim() || candidateName;
    if (!submittedName) {
      setBanner({ tone: "danger", message: "Canonical name is required." });
      return;
    }

    if (aliasTarget) {
      recordDraftDecision(
        {
          type: "add_alias",
          candidateName,
          entityId: aliasTarget.id,
        },
        makeDraftResolution({
          candidateName,
          resolution: "resolved",
          action: "add_alias",
          summary: buildResolutionSummary({
            action: "add_alias",
            candidateName,
            category: aliasTarget.category,
            targetName: aliasTarget.canonicalName,
          }),
          entityId: aliasTarget.id,
          entityCategory: aliasTarget.category,
        })
      );
    } else {
      recordDraftDecision(
        {
          type: "create_entity",
          candidateName,
          canonicalName: submittedName,
          category: createCategory,
        },
        makeDraftResolution({
          candidateName,
          resolution: "created",
          action: "create_entity",
          summary: buildResolutionSummary({
            action: "create_entity",
            candidateName,
            category: createCategory,
            targetName: submittedName,
          }),
          entityId: null,
          entityCategory: createCategory,
        })
      );
    }

    setCreateTarget(null);
    setCreateName("");
  }

  function handleIgnore(candidateName: string) {
    recordDraftDecision(
      {
        type: "ignore_candidate",
        candidateName,
      },
      makeDraftResolution({
        candidateName,
        resolution: "ignored",
        action: "ignore_candidate",
        summary: buildResolutionSummary({
          action: "ignore_candidate",
          candidateName,
        }),
        entityId: null,
        entityCategory: null,
      })
    );
  }

  async function handleSave() {
    if (!canWrite || draftDecisions.length === 0) {
      return;
    }

    setIsSaving(true);
    setBanner(null);
    try {
      const result = await saveEntityReviewBatchApi(
        {
          sessionId,
          campaignSlug,
          decisions: draftDecisions,
        },
        scopedParams
      );
      setCandidates(result.candidates);
      setDraftDecisions([]);
      await Promise.all([loadRegistryEntities(), loadBatches()]);
      onResolutionChange?.();
      setBanner({
        tone: "success",
        message: `Saved ${result.batch.decisionCount} entity decision${result.batch.decisionCount === 1 ? "" : "s"}.`,
      });
    } catch {
      setBanner({ tone: "danger", message: "Failed to save entity review decisions." });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRevert(batchId: string) {
    setRevertingBatchId(batchId);
    setBanner(null);
    try {
      const result = await revertEntityReviewBatchApi({ sessionId, batchId }, scopedParams);
      setCandidates(result.candidates);
      setDraftDecisions([]);
      await Promise.all([loadRegistryEntities(), loadBatches()]);
      onResolutionChange?.();
      setBanner({ tone: "success", message: `Reverted batch ${result.batch.id}.` });
    } catch {
      setBanner({ tone: "danger", message: "Failed to revert this entity review batch." });
    } finally {
      setRevertingBatchId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-background/35 p-4">
        <p className="text-xs text-muted-foreground">Scanning for entity candidates…</p>
      </div>
    );
  }

  if (candidates.length === 0 && batches.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {candidates.length > 0 ? (
        !isExpanded ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Entity Candidates
                </h4>
                <p className="text-xs text-muted-foreground">
                  {unsavedCount > 0
                    ? `Entity candidates ready. ${unsavedCount} unsaved decision${unsavedCount === 1 ? "" : "s"}.`
                    : unresolvedCount > 0
                      ? `Entity candidates are ready for review. ${unresolvedCount} still need a decision.`
                      : `All entity decisions saved. ${resolvedCount} decision${resolvedCount === 1 ? "" : "s"} recorded.`}
                </p>
              </div>
              {unsavedCount > 0 ? (
                <StatusChip label={`${unsavedCount} unsaved`} tone="warning" />
              ) : unresolvedCount > 0 ? (
                <StatusChip label={`${unresolvedCount} unresolved`} tone="warning" />
              ) : (
                <StatusChip label="All saved" tone="success" />
              )}
            </div>

            {banner && (
              <div
                className={`rounded-lg px-3 py-2 text-xs ${
                  banner.tone === "success"
                    ? "border border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                    : "border border-rose-400/40 bg-rose-400/10 text-rose-200"
                }`}
              >
                {banner.message}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {candidates.length} candidate{candidates.length === 1 ? "" : "s"} detected
              </p>
              <div className="flex items-center gap-2">
                {canWrite && unsavedCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    {isSaving ? "Saving" : "Save"}
                  </button>
                ) : null}
                {candidates.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setIsExpanded(true)}
                    className="rounded-md bg-amber-600/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-amber-600"
                  >
                    {unresolvedCount > 0 || unsavedCount > 0 ? "Review Now" : "Review Again"}
                  </button>
                ) : null}
              </div>
            </div>

            {recentResolutions.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-border/50 bg-background/20 px-3 py-2">
                {recentResolutions.map((candidate) => {
                  const resolution = candidate.resolution;
                  if (!resolution) {
                    return null;
                  }

                  return (
                    <div key={`recent-${candidate.candidateName}`} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <StatusChip label={ACTION_LABELS[resolution.action]} tone={resolutionTone(resolution.action)} />
                      <p className="pt-0.5">{resolveSummaryText(resolution, registryEntities)}</p>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Entity Candidates
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  {unsavedCount > 0
                    ? `${unsavedCount} draft decision${unsavedCount === 1 ? "" : "s"} ready to save.`
                    : unresolvedCount > 0
                      ? `Review ${unresolvedCount} unresolved candidate${unresolvedCount === 1 ? "" : "s"}.`
                      : "All entity decisions saved. Collapse to return to the compact summary card."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unsavedCount > 0 ? (
                  <StatusChip label={`${unsavedCount} unsaved`} tone="warning" />
                ) : unresolvedCount > 0 ? (
                  <StatusChip label={`${unresolvedCount} unresolved`} tone="warning" />
                ) : (
                  <StatusChip label="All saved" tone="success" />
                )}
                <button
                  type="button"
                  onClick={collapseToSummaryCard}
                  className="rounded-md border border-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  Collapse
                </button>
              </div>
            </div>

            {banner && (
              <div
                className={`rounded-lg px-3 py-2 text-xs ${
                  banner.tone === "success"
                    ? "border border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                    : "border border-rose-400/40 bg-rose-400/10 text-rose-200"
                }`}
              >
                {banner.message}
              </div>
            )}

            <div className="space-y-2">
              {candidates.map((candidate) => {
                const isResolved = candidate.resolution !== null;
                const isCreating = createTarget === candidate.candidateName;
                const hasDraftDecision = draftDecisions.some(
                  (decision) => decision.candidateName === candidate.candidateName
                );
                const aliasTarget = registryEntities.find((entity) => {
                  const normalizedCreateName = normalizeName(createName);
                  if (!normalizedCreateName) {
                    return false;
                  }

                  const exact = normalizeName(entity.canonicalName) === normalizedCreateName;
                  const aliasExact = entity.aliases.some((alias) => normalizeName(alias) === normalizedCreateName);
                  return exact || aliasExact;
                });

                return (
                  <div
                    key={candidate.candidateName}
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      isResolved
                        ? "border-border/40 bg-background/20 text-muted-foreground"
                        : "border-amber-400/20 bg-background/40 text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold truncate">{candidate.candidateName}</span>
                        <span className="text-muted-foreground shrink-0">×{candidate.mentions}</span>
                        {candidate.resolution && (
                          <StatusChip
                            label={ACTION_LABELS[candidate.resolution.action]}
                            tone={resolutionTone(candidate.resolution.action)}
                          />
                        )}
                      </div>

                      {canWrite && !isResolved ? (
                        <div className="flex items-center gap-1 shrink-0">
                          {candidate.possibleMatches.length > 0 ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  handleResolve(
                                    candidate.candidateName,
                                    candidate.possibleMatches[0].entityId,
                                    candidate.possibleMatches[0].category,
                                    candidate.possibleMatches[0].canonicalName
                                  )
                                }
                                className="rounded-md bg-emerald-600/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-emerald-600"
                                title={`Link to ${candidate.possibleMatches[0].canonicalName}`}
                              >
                                Link → {candidate.possibleMatches[0].canonicalName}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleAddAlias(
                                    candidate.candidateName,
                                    candidate.possibleMatches[0].entityId,
                                    candidate.possibleMatches[0].category,
                                    candidate.possibleMatches[0].canonicalName
                                  )
                                }
                                className="rounded-md bg-sky-600/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-sky-600"
                                title={`Add ${candidate.candidateName} as an alias for ${candidate.possibleMatches[0].canonicalName}`}
                              >
                                Add Alias
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setCreateTarget(isCreating ? null : candidate.candidateName);
                              setCreateName(candidate.candidateName);
                              setCreateCategory("npcs");
                              setIsExpanded(true);
                            }}
                            className="rounded-md bg-amber-600/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-amber-600"
                          >
                            Create Entity
                          </button>
                          <button
                            type="button"
                            onClick={() => handleIgnore(candidate.candidateName)}
                            className="rounded-md bg-zinc-600/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-zinc-600"
                          >
                            Ignore
                          </button>
                        </div>
                      ) : canWrite && hasDraftDecision ? (
                        <button
                          type="button"
                          onClick={() => undoDraftDecision(candidate.candidateName)}
                          className="rounded-md border border-border/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        >
                          Undo
                        </button>
                      ) : null}
                    </div>

                    {!isResolved && candidate.examples.length > 0 ? (
                      <div className="mt-1 space-y-1">
                        {candidate.examples.map((example, index) => {
                          const preview = buildMentionPreview(example, candidate.candidateName);
                          return (
                            <p key={index} className="text-[10px] italic leading-relaxed text-muted-foreground break-words">
                              <span>&ldquo;{preview.prefix}</span>
                              {preview.match ? (
                                <span className="font-semibold not-italic text-amber-200">{preview.match}</span>
                              ) : null}
                              <span>{preview.suffix}&rdquo;</span>
                            </p>
                          );
                        })}
                      </div>
                    ) : null}

                    {candidate.resolution ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        {resolveSummaryText(candidate.resolution, registryEntities)}
                      </p>
                    ) : null}

                    {isCreating ? (
                      <div className="mt-2 space-y-2 border-t border-border/40 pt-2">
                        <div className="flex items-center gap-2">
                          <select
                            value={createCategory}
                            onChange={(event) => setCreateCategory(event.target.value as RegistryCategoryKey)}
                            className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px]"
                          >
                            {CATEGORY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={createName}
                            onChange={(event) => setCreateName(event.target.value)}
                            placeholder="Canonical name"
                            className="flex-1 rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] min-w-0"
                          />
                          <button
                            type="button"
                            onClick={() => handleCreate(candidate.candidateName, aliasTarget)}
                            className="rounded-md bg-amber-600 px-2 py-1 text-[10px] font-bold uppercase text-white hover:bg-amber-500"
                          >
                            {aliasTarget ? `Stage Add Alias -> ${aliasTarget.canonicalName}` : "Stage Create Entity"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCreateTarget(null)}
                            className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                        {filteredRegistryMatches.length > 0 ? (
                          <div className="rounded-md border border-border/50 bg-background/30 p-1">
                            {filteredRegistryMatches.map((entity) => (
                              <button
                                key={entity.id}
                                type="button"
                                onClick={() => {
                                  setCreateName(entity.canonicalName);
                                  setCreateCategory(entity.category);
                                }}
                                className="flex w-full items-start justify-between rounded px-2 py-1 text-left text-[10px] hover:bg-background/50"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold text-foreground">{entity.canonicalName}</span>
                                  <span className="block truncate text-muted-foreground">
                                    {entity.aliases.length > 0 ? `Aliases: ${entity.aliases.join(", ")}` : entity.id}
                                  </span>
                                </span>
                                <span className="ml-2 shrink-0 text-muted-foreground uppercase">{entity.category}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {isCreating ? (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Drafts stay local until Save. Exact canonical-name matches stage an alias against the existing entry instead of creating a duplicate.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {canWrite ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/20 px-3 py-2">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  {unsavedCount > 0
                    ? `${unsavedCount} unsaved decision${unsavedCount === 1 ? "" : "s"}`
                    : "No unsaved decisions"}
                </p>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || unsavedCount === 0}
                  className="rounded-md bg-emerald-600/85 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {isSaving ? "Saving" : `Save All${unsavedCount > 0 ? ` (${unsavedCount})` : ""}`}
                </button>
              </div>
            ) : null}
          </div>
        )
      ) : null}

      {batches.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-background/35 p-4 space-y-3">
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground/80">Entity Review History</h4>
            <p className="text-xs text-muted-foreground">Saved decisions from this session.</p>
          </div>
          <div className="space-y-2">
            {batches.map((batch) => (
              <div
                key={batch.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/20 px-3 py-2 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="font-semibold text-foreground truncate">Batch {batch.id}</p>
                  <p className="text-muted-foreground">
                    {batch.decisionCount} decision{batch.decisionCount === 1 ? "" : "s"} · {new Date(batch.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusChip
                    label={batch.status}
                    tone={batch.status === "applied" ? "success" : batch.status === "failed" ? "danger" : "neutral"}
                  />
                  {canWrite && batch.status === "applied" ? (
                    <button
                      type="button"
                      onClick={() => handleRevert(batch.id)}
                      disabled={revertingBatchId === batch.id || isSaving || unsavedCount > 0}
                      className="rounded-md border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-200 hover:bg-rose-400/15 disabled:opacity-50"
                    >
                      {revertingBatchId === batch.id ? "Reverting" : "Revert"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {unsavedCount > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Save or discard draft decisions before reverting a saved batch.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}