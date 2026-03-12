"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCampaignRegistryApi } from "@/lib/api/registry";
import type { EntityCandidateDto, RegistryCategoryKey, RegistryEntityDto } from "@/lib/registry/types";
import {
  getEntityCandidatesApi,
  resolveEntityApi,
  createEntityFromCandidateApi,
  ignoreEntityCandidateApi,
} from "@/lib/api/sessions";
import { StatusChip } from "@/components/shared/status-chip";

type Props = {
  sessionId: string;
  campaignSlug: string;
  searchParams?: Record<string, string | string[] | undefined>;
  canWrite: boolean;
  onResolutionChange?: () => void;
};

const CATEGORY_OPTIONS: Array<{ value: RegistryCategoryKey; label: string }> = [
  { value: "npcs", label: "NPC" },
  { value: "pcs", label: "PC" },
  { value: "locations", label: "Location" },
  { value: "factions", label: "Faction" },
  { value: "misc", label: "Misc" },
];

export function EntityResolutionPanel({
  sessionId,
  campaignSlug,
  searchParams,
  canWrite,
  onResolutionChange,
}: Props) {
  const [candidates, setCandidates] = useState<EntityCandidateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [registryEntities, setRegistryEntities] = useState<RegistryEntityDto[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Create-new-entity inline form state
  const [createTarget, setCreateTarget] = useState<string | null>(null);
  const [createCategory, setCreateCategory] = useState<RegistryCategoryKey>("npcs");
  const [createName, setCreateName] = useState("");

  const scopedParams = useMemo(
    () => ({ ...searchParams, campaign_slug: campaignSlug }),
    [campaignSlug, searchParams]
  );

  const applyResolutionLocally = useCallback(
    (candidateName: string, resolution: EntityCandidateDto["resolution"]) => {
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

  const applyRegistryWriteLocally = useCallback(
    (args: {
      candidateName: string;
      canonicalName: string;
      category: RegistryCategoryKey;
      entityId: string;
      resolutionKind: "resolved" | "created";
    }) => {
      setRegistryEntities((current) => {
        const existingIndex = current.findIndex((entity) => entity.id === args.entityId);
        if (existingIndex >= 0) {
          const next = [...current];
          const existing = next[existingIndex];
          const hasAlias = existing.aliases.some((alias) => normalizeName(alias) === normalizeName(args.candidateName));
          next[existingIndex] = {
            ...existing,
            aliases: hasAlias ? existing.aliases : [...existing.aliases, args.candidateName],
          };
          return next;
        }

        return [
          ...current,
          {
            id: args.entityId,
            canonicalName: args.canonicalName,
            aliases:
              args.resolutionKind === "created"
              && shouldPreserveCandidateAliasLocally(current, args.canonicalName, args.candidateName)
                ? [args.candidateName]
                : [],
            notes: "",
            category: args.category,
            discordUserId: null,
          },
        ];
      });
    },
    []
  );

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getEntityCandidatesApi(sessionId, scopedParams);
      setCandidates(result.candidates);
    } catch {
      setError("Failed to load entity candidates.");
    } finally {
      setLoading(false);
    }
  }, [scopedParams, sessionId]);

  const loadRegistryEntities = useCallback(async () => {
    try {
      const result = await getCampaignRegistryApi(campaignSlug, scopedParams);
      setRegistryEntities(Object.values(result.registry.categories).flat());
    } catch {
      setRegistryEntities([]);
    }
  }, [campaignSlug, scopedParams]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    if (!canWrite) return;
    loadRegistryEntities();
  }, [canWrite, loadRegistryEntities]);

  async function handleResolve(candidateName: string, entityId: string) {
    setPendingAction(candidateName);
    try {
      const result = await resolveEntityApi(sessionId, { candidateName, entityId }, scopedParams);
      applyResolutionLocally(candidateName, result.resolution);
      onResolutionChange?.();
    } catch {
      setError(`Failed to resolve "${candidateName}".`);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCreate(candidateName: string) {
    setPendingAction(candidateName);
    try {
      const submittedName = createName.trim() || candidateName;
      const submittedCategory = createCategory;
      const result = await createEntityFromCandidateApi(
        sessionId,
        {
          candidateName,
          category: submittedCategory,
          canonicalName: submittedName || undefined,
        },
        scopedParams
      );
      applyResolutionLocally(candidateName, result.resolution);
      if (result.resolution.entityId && result.resolution.entityCategory) {
        applyRegistryWriteLocally({
          candidateName,
          canonicalName: submittedName,
          category: result.resolution.entityCategory,
          entityId: result.resolution.entityId,
          resolutionKind: result.resolution.resolution === "resolved" ? "resolved" : "created",
        });
      }
      setCreateTarget(null);
      setCreateName("");
      onResolutionChange?.();
    } catch {
      setError(`Failed to create entity from "${candidateName}".`);
    } finally {
      setPendingAction(null);
    }
  }

  function normalizeName(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
      .replace(/\s+/g, " ");
  }

  function shouldPreserveCandidateAliasLocally(
    entities: RegistryEntityDto[],
    canonicalName: string,
    candidateName: string
  ): boolean {
    const canonicalKey = normalizeName(canonicalName);
    const candidateKey = normalizeName(candidateName);
    if (!candidateKey || canonicalKey === candidateKey) {
      return false;
    }

    return !entities.some(
      (entity) =>
        normalizeName(entity.canonicalName) === candidateKey
        || entity.aliases.some((alias) => normalizeName(alias) === candidateKey)
    );
  }

  function collapseToSummaryCard() {
    setIsExpanded(false);
    setCreateTarget(null);
    setCreateName("");
  }

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

  async function handleIgnore(candidateName: string) {
    setPendingAction(candidateName);
    try {
      const result = await ignoreEntityCandidateApi(sessionId, { candidateName }, scopedParams);
      applyResolutionLocally(candidateName, result.resolution);
      onResolutionChange?.();
    } catch {
      setError(`Failed to ignore "${candidateName}".`);
    } finally {
      setPendingAction(null);
    }
  }

  const unresolvedCount = candidates.filter((c) => !c.resolution).length;
  const resolvedCount = candidates.length - unresolvedCount;

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-background/35 p-4">
        <p className="text-xs text-muted-foreground">Scanning for entity candidates…</p>
      </div>
    );
  }

  if (candidates.length === 0) {
    return null; // No candidates — don't show the panel at all
  }

  if (!isExpanded) {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
              Entity Candidates
            </h4>
            <p className="text-xs text-muted-foreground">
              {unresolvedCount > 0
                ? `Entity candidates are ready for review. ${unresolvedCount} still need a decision.`
                : `All entity candidates reviewed. ${resolvedCount} decision${resolvedCount === 1 ? "" : "s"} recorded.`}
            </p>
          </div>
          {unresolvedCount > 0 ? (
            <StatusChip label={`${unresolvedCount} unresolved`} tone="warning" />
          ) : (
            <StatusChip label="All reviewed" tone="success" />
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {candidates.length} candidate{candidates.length === 1 ? "" : "s"} detected
          </p>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="rounded-md bg-amber-600/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-amber-600"
          >
            {unresolvedCount > 0 ? "Review Now" : "Review Again"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
            Entity Candidates
          </h4>
          <p className="text-[11px] text-muted-foreground">
            {unresolvedCount > 0
              ? `Review ${unresolvedCount} unresolved candidate${unresolvedCount === 1 ? "" : "s"}.`
              : "All entity candidates reviewed. Collapse to return to the compact summary card."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unresolvedCount > 0 ? (
            <StatusChip label={`${unresolvedCount} unresolved`} tone="warning" />
          ) : (
            <StatusChip label="All reviewed" tone="success" />
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

      {error && (
        <div className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {candidates.map((candidate) => {
          const isResolved = candidate.resolution !== null;
          const isPending = pendingAction === candidate.candidateName;
          const isCreating = createTarget === candidate.candidateName;
          const aliasTarget = registryEntities.find((entity) => {
            const exact = normalizeName(entity.canonicalName) === normalizeName(createName);
            const aliasExact = entity.aliases.some((alias) => normalizeName(alias) === normalizeName(createName));
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
                      label={candidate.resolution.resolution}
                      tone={
                        candidate.resolution.resolution === "resolved" || candidate.resolution.resolution === "created"
                          ? "success"
                          : "neutral"
                      }
                    />
                  )}
                </div>

                {canWrite && !isResolved && (
                  <div className="flex items-center gap-1 shrink-0">
                    {candidate.possibleMatches.length > 0 && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleResolve(candidate.candidateName, candidate.possibleMatches[0].entityId)}
                        className="rounded-md bg-emerald-600/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-emerald-600 disabled:opacity-50"
                        title={`Link to ${candidate.possibleMatches[0].canonicalName}`}
                      >
                        Link → {candidate.possibleMatches[0].canonicalName}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setCreateTarget(isCreating ? null : candidate.candidateName);
                        setCreateName(candidate.candidateName);
                        setCreateCategory("npcs");
                        setIsExpanded(true);
                      }}
                      className="rounded-md bg-amber-600/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-amber-600 disabled:opacity-50"
                    >
                      New / Alias
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleIgnore(candidate.candidateName)}
                      className="rounded-md bg-zinc-600/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-zinc-600 disabled:opacity-50"
                    >
                      Ignore
                    </button>
                  </div>
                )}
              </div>

              {/* Evidence examples */}
              {!isResolved && candidate.examples.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {candidate.examples.map((ex, i) => (
                    <p key={i} className="text-[10px] text-muted-foreground truncate italic">
                      &ldquo;{ex}&rdquo;
                    </p>
                  ))}
                </div>
              )}

              {/* Inline create form */}
              {isCreating && (
                <div className="mt-2 space-y-2 border-t border-border/40 pt-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={createCategory}
                      onChange={(e) => setCreateCategory(e.target.value as RegistryCategoryKey)}
                      className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px]"
                    >
                      {CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="Canonical name"
                      className="flex-1 rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] min-w-0"
                    />
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleCreate(candidate.candidateName)}
                      className="rounded-md bg-amber-600 px-2 py-1 text-[10px] font-bold uppercase text-white hover:bg-amber-500 disabled:opacity-50"
                    >
                      {aliasTarget ? `Add Alias -> ${aliasTarget.canonicalName}` : "Create Entity"}
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
              )}
              {isCreating ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  If the canonical name matches an existing compendium entry, submitting will resolve this candidate to that entity and add the candidate name as an alias instead of creating a duplicate.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
