"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyCampaignRegistryPendingActionApi,
  createCampaignRegistryEntryApi,
  deleteCampaignRegistryEntryApi,
  getEntityAppearancesApi,
  getCampaignRegistryApi,
  updateCampaignRegistryEntryApi,
} from "@/lib/api/registry";
import { WebApiError } from "@/lib/api/http";
import { getEntityCandidatesApi } from "@/lib/api/sessions";
import type { EntityAppearanceDto, EntityCandidateDto } from "@/lib/registry/types";
import type {
  RegistryCategoryKey,
  RegistryEntityDto,
  RegistrySnapshotDto,
  SeenDiscordUserOption,
} from "@/lib/registry/types";
import {
  buildPcDiscordUserSelectionModel,
  formatSeenDiscordUserLabel,
  NO_KNOWN_USERS_HELPER_TEXT,
  UNKNOWN_STORED_MAPPING_LABEL,
} from "@/lib/registry/pcDiscordUserSelection";
import { formatSessionDisplayTitle } from "@/lib/campaigns/display";
import { useVerboseMode } from "@/providers/verbose-mode-provider";
import { EntityResolutionPanel } from "@/components/session/entity-resolution-panel";

const CATEGORY_TABS: Array<{ key: RegistryCategoryKey; label: string }> = [
  { key: "pcs", label: "PCs" },
  { key: "npcs", label: "NPCs" },
  { key: "locations", label: "Locations" },
  { key: "factions", label: "Factions" },
  { key: "misc", label: "Misc" },
];

type CampaignRegistryManagerProps = {
  campaignSlug: string;
  guildId?: string | null;
  initialRegistry: RegistrySnapshotDto;
  initialSeenDiscordUsers: SeenDiscordUserOption[];
  searchParams?: Record<string, string | string[] | undefined>;
  isEditable?: boolean;
  readOnlyReason?: "not_campaign_dm" | "demo_mode";
  selectedSessionId?: string | null;
};

function getReadOnlyMessage(reason?: "not_campaign_dm" | "demo_mode"): string {
  if (reason === "not_campaign_dm") {
    return "This compendium is read-only because you are not the DM for this campaign.";
  }
  return "This compendium is read-only in system demo mode.";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof WebApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Compendium action failed.";
}

function normalizeCsvAliases(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function CampaignRegistryManager({
  campaignSlug,
  guildId,
  initialRegistry,
  initialSeenDiscordUsers,
  searchParams,
  isEditable = true,
  readOnlyReason,
  selectedSessionId,
}: CampaignRegistryManagerProps) {
  const { verboseModeEnabled } = useVerboseMode();
  const [registry, setRegistry] = useState(initialRegistry);
  const [activeTab, setActiveTab] = useState<RegistryCategoryKey | "pending" | "ignore">("pcs");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isCreateExpanded, setIsCreateExpanded] = useState(false);

  const [newCategory, setNewCategory] = useState<RegistryCategoryKey>("npcs");
  const [newCanonicalName, setNewCanonicalName] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newDiscordUserId, setNewDiscordUserId] = useState("");
  const [pendingPromoteCategory, setPendingPromoteCategory] = useState<RegistryCategoryKey>("npcs");
  const [pendingPromoteDiscordUserId, setPendingPromoteDiscordUserId] = useState("");

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Appearance history: expanded entity -> cached appearances
  const [expandedAppearanceId, setExpandedAppearanceId] = useState<string | null>(null);
  const [appearanceCache, setAppearanceCache] = useState<Record<string, EntityAppearanceDto[]>>({});
  const [appearanceLoading, setAppearanceLoading] = useState(false);

  // Session-scope filtering
  const [sessionScope, setSessionScope] = useState<"current" | "all">(
    selectedSessionId ? "current" : "all"
  );
  const [sessionCandidates, setSessionCandidates] = useState<EntityCandidateDto[]>([]);
  const [sessionCandidatesLoading, setSessionCandidatesLoading] = useState(false);

  const scopedSearchParams = useMemo(
    () => ({
      ...(searchParams ?? {}),
      ...(guildId ? { guild_id: guildId } : {}),
    }),
    [guildId, searchParams]
  );

  // Load session-scoped candidates when selectedSessionId changes
  useEffect(() => {
    if (!selectedSessionId) {
      setSessionCandidates([]);
      setSessionScope("all");
      return;
    }
    setSessionScope("current");
    setSessionCandidatesLoading(true);
    getEntityCandidatesApi(selectedSessionId, scopedSearchParams)
      .then((res) => setSessionCandidates(res.candidates))
      .catch(() => setSessionCandidates([]))
      .finally(() => setSessionCandidatesLoading(false));
  }, [selectedSessionId, scopedSearchParams]);

  // Build a set of candidate names from the current session for cross-referencing
  const sessionCandidateNames = useMemo(() => {
    if (sessionCandidates.length === 0) return new Set<string>();
    const names = new Set<string>();
    for (const c of sessionCandidates) {
      names.add(c.candidateName.toLowerCase());
    }
    return names;
  }, [sessionCandidates]);

  const refreshRegistry = useCallback(async () => {
    try {
      const result = await getCampaignRegistryApi(campaignSlug, scopedSearchParams);
      setRegistry(result.registry);
    } catch {
      // Silently fail — registry may already be stale but we don't want to hide the UI
    }
  }, [campaignSlug, scopedSearchParams]);

  const toggleAppearances = useCallback(
    async (entityId: string) => {
      if (expandedAppearanceId === entityId) {
        setExpandedAppearanceId(null);
        return;
      }
      setExpandedAppearanceId(entityId);
      if (appearanceCache[entityId]) return;
      setAppearanceLoading(true);
      try {
        const res = await getEntityAppearancesApi(campaignSlug, entityId, scopedSearchParams);
        setAppearanceCache((prev) => ({ ...prev, [entityId]: res.appearances }));
      } catch {
        setAppearanceCache((prev) => ({ ...prev, [entityId]: [] }));
      } finally {
        setAppearanceLoading(false);
      }
    },
    [expandedAppearanceId, appearanceCache, campaignSlug, scopedSearchParams]
  );

  const categoryCounts = useMemo(
    () => ({
      pcs: registry.categories.pcs.length,
      npcs: registry.categories.npcs.length,
      locations: registry.categories.locations.length,
      factions: registry.categories.factions.length,
      misc: registry.categories.misc.length,
      pending: registry.pending.items.length,
      ignore: registry.ignoreTokens.length,
    }),
    [registry]
  );

  const hasKnownDiscordUsers = initialSeenDiscordUsers.length > 0;

  const createPcSelection = useMemo(
    () => buildPcDiscordUserSelectionModel({ knownUsers: initialSeenDiscordUsers }),
    [initialSeenDiscordUsers]
  );

  const pendingPcSelection = useMemo(
    () => buildPcDiscordUserSelectionModel({ knownUsers: initialSeenDiscordUsers }),
    [initialSeenDiscordUsers]
  );

  const seenUserLabelById = useMemo(() => {
    const byId = new Map<string, string>();
    for (const user of initialSeenDiscordUsers) {
      byId.set(user.discordUserId, formatSeenDiscordUserLabel(user));
    }
    return byId;
  }, [initialSeenDiscordUsers]);

  const filteredEntities = useMemo(() => {
    if (!(activeTab in registry.categories)) {
      return [] as RegistryEntityDto[];
    }

    let entities = registry.categories[activeTab as RegistryCategoryKey];

    // Session-scope filter: only show entities whose name or aliases appear in session candidates
    if (sessionScope === "current" && selectedSessionId && sessionCandidateNames.size > 0) {
      entities = entities.filter((entity) => {
        if (sessionCandidateNames.has(entity.canonicalName.toLowerCase())) return true;
        return entity.aliases.some((alias) => sessionCandidateNames.has(alias.toLowerCase()));
      });
    }

    const q = query.trim().toLowerCase();
    if (!q) return entities;

    return entities.filter((entity) => {
      if (entity.canonicalName.toLowerCase().includes(q)) return true;
      if (entity.id.toLowerCase().includes(q)) return true;
      if (entity.aliases.some((alias) => alias.toLowerCase().includes(q))) return true;
      if (entity.notes.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [activeTab, query, registry, sessionScope, selectedSessionId, sessionCandidateNames]);

  const filteredPending = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registry.pending.items;
    return registry.pending.items.filter((item) => {
      if (item.display.toLowerCase().includes(q)) return true;
      if (item.key.toLowerCase().includes(q)) return true;
      return item.examples.some((example) => example.toLowerCase().includes(q));
    });
  }, [query, registry.pending.items]);

  const filteredIgnore = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registry.ignoreTokens;
    return registry.ignoreTokens.filter((token) => token.toLowerCase().includes(q));
  }, [query, registry.ignoreTokens]);

  async function withUpdate(action: () => Promise<RegistrySnapshotDto>, successMessage: string) {
    setIsPending(true);
    setError(null);
    setStatus(null);
    try {
      const next = await action();
      setRegistry(next);
      setStatus(successMessage);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    } finally {
      setIsPending(false);
    }
  }

  async function handleCreateEntry() {
    const canonicalName = newCanonicalName.trim();
    if (!canonicalName) {
      setError("Canonical name is required.");
      return;
    }
    if (newCategory === "pcs" && !hasKnownDiscordUsers) {
      setError(NO_KNOWN_USERS_HELPER_TEXT);
      return;
    }
    if (newCategory === "pcs" && !newDiscordUserId.trim()) {
      setError("Played by is required for PC entries.");
      return;
    }

    await withUpdate(async () => {
      const response = await createCampaignRegistryEntryApi(
        campaignSlug,
        newCategory === "pcs"
          ? {
              category: "pcs",
              canonicalName,
              aliases: normalizeCsvAliases(newAliases),
              notes: newNotes.trim(),
              discordUserId: newDiscordUserId.trim(),
            }
          : {
              category: newCategory,
              canonicalName,
              aliases: normalizeCsvAliases(newAliases),
              notes: newNotes.trim(),
            },
        scopedSearchParams
      );
      return response.registry;
    }, `Added ${canonicalName}.`);

    setNewCanonicalName("");
    setNewAliases("");
    setNewNotes("");
    setNewDiscordUserId("");
  }

  async function handleSaveEntry(entity: RegistryEntityDto) {
    const form = document.getElementById(`edit-form-${entity.id}`) as HTMLFormElement | null;
    if (!form) return;

    const formData = new FormData(form);
    const canonicalName = String(formData.get("canonicalName") ?? "").trim();
    const aliases = normalizeCsvAliases(String(formData.get("aliases") ?? ""));
    const notes = String(formData.get("notes") ?? "").trim();
    const discordUserId = String(formData.get("discordUserId") ?? "").trim();

    if (entity.category === "pcs" && !discordUserId) {
      setError("Played by is required for PC entries.");
      return;
    }

    await withUpdate(async () => {
      const response = await updateCampaignRegistryEntryApi(
        campaignSlug,
        entity.id,
        entity.category === "pcs"
          ? {
              category: "pcs",
              canonicalName,
              aliases,
              notes,
              discordUserId,
            }
          : {
              category: entity.category,
              canonicalName,
              aliases,
              notes,
            },
        scopedSearchParams
      );
      return response.registry;
    }, `Updated ${canonicalName || entity.canonicalName}.`);

    setEditingEntryId(null);
  }

  async function handleDeleteEntry(entity: RegistryEntityDto) {
    if (!window.confirm("Delete this registry entry?\nThis removes it from the campaign compendium.")) {
      return;
    }

    await withUpdate(async () => {
      const response = await deleteCampaignRegistryEntryApi(
        campaignSlug,
        entity.id,
        { category: entity.category },
        scopedSearchParams,
      );
      return response.registry;
    }, `Deleted ${entity.canonicalName}.`);

    setEditingEntryId((current) => current === entity.id ? null : current);
    setExpandedAppearanceId((current) => current === entity.id ? null : current);
  }

  async function handlePendingAccept(key: string, category: RegistryCategoryKey) {
    if (category === "pcs" && !hasKnownDiscordUsers) {
      setError(NO_KNOWN_USERS_HELPER_TEXT);
      return;
    }
    if (category === "pcs" && !pendingPromoteDiscordUserId.trim()) {
      setError("Played by is required for PC entries.");
      return;
    }

    await withUpdate(async () => {
      const response = await applyCampaignRegistryPendingActionApi(
        campaignSlug,
        category === "pcs"
          ? {
              action: "accept",
              key,
              category: "pcs",
              discordUserId: pendingPromoteDiscordUserId.trim(),
            }
          : {
              action: "accept",
              key,
              category,
            },
        scopedSearchParams
      );
      return response.registry;
    }, "Pending candidate promoted.");
  }

  async function handlePendingReject(key: string) {
    await withUpdate(async () => {
      const response = await applyCampaignRegistryPendingActionApi(
        campaignSlug,
        {
          action: "reject",
          key,
        },
        scopedSearchParams
      );
      return response.registry;
    }, "Pending candidate rejected and added to ignore.");
  }

  async function handlePendingDelete(key: string) {
    await withUpdate(async () => {
      const response = await applyCampaignRegistryPendingActionApi(
        campaignSlug,
        {
          action: "delete",
          key,
        },
        scopedSearchParams
      );
      return response.registry;
    }, "Pending candidate removed.");
  }

  return (
    <div className="space-y-6">
      {verboseModeEnabled ? (
      <section className="rounded-xl card-glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-serif">Campaign Compendium</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              YAML is the source of truth. This UI applies structured campaign-scoped mutations only.
            </p>
            {!isEditable ? (
              <p className="mt-2 text-xs uppercase tracking-wider text-amber-200/90">
                {getReadOnlyMessage(readOnlyReason)}
              </p>
            ) : null}
          </div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Campaign: {registry.campaignSlug}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground md:grid-cols-7">
          {CATEGORY_TABS.map((tab) => (
            <div key={tab.key} className="rounded-md border border-border/60 bg-background/35 px-2 py-1">
              <span className="font-semibold text-foreground">{tab.label}</span>: {categoryCounts[tab.key]}
            </div>
          ))}
          <div className="rounded-md border border-amber-400/30 bg-amber-400/5 px-2 py-1">
            <span className="font-semibold text-amber-300">Pending</span>: {categoryCounts.pending}
          </div>
          <div className="rounded-md border border-border/60 bg-background/35 px-2 py-1">
            <span className="font-semibold text-foreground">Ignore</span>: {categoryCounts.ignore}
          </div>
        </div>
      </section>
      ) : (
        !isEditable ? (
          <p className="text-xs uppercase tracking-wider text-amber-200/90">
            {getReadOnlyMessage(readOnlyReason)}
          </p>
        ) : null
      )}

      <section className="rounded-xl card-glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                  activeTab === tab.key ? "bg-primary text-primary-foreground cursor-pointer" : "control-button-ghost"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-border/50" aria-hidden />
            <button
              type="button"
              onClick={() => setActiveTab("pending")}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                activeTab === "pending"
                  ? "bg-amber-600 text-white cursor-pointer"
                  : "border border-amber-400/30 bg-amber-400/5 text-amber-300 hover:bg-amber-400/10"
              }`}
            >
              Pending{categoryCounts.pending > 0 ? ` (${categoryCounts.pending})` : ""}
            </button>
            {verboseModeEnabled ? (
              <button
                type="button"
                onClick={() => setActiveTab("ignore")}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                  activeTab === "ignore" ? "bg-primary text-primary-foreground cursor-pointer" : "control-button-ghost"
                }`}
              >
                Ignore
              </button>
            ) : null}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="control-input w-full max-w-xs rounded-md px-3 py-2 text-sm"
            placeholder="Search"
          />
        </div>

        {selectedSessionId ? (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex rounded-lg border border-border/70 bg-background/50 p-0.5">
              <button
                type="button"
                onClick={() => setSessionScope("current")}
                className={`rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all ${
                  sessionScope === "current"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Current Session
              </button>
              <button
                type="button"
                onClick={() => setSessionScope("all")}
                className={`rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all ${
                  sessionScope === "all"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Show All
              </button>
            </div>
            {sessionScope === "current" && sessionCandidatesLoading ? (
              <span className="text-xs text-muted-foreground">Loading…</span>
            ) : null}
            {sessionScope === "current" && !sessionCandidatesLoading && sessionCandidateNames.size === 0 ? (
              <span className="text-xs text-muted-foreground">
                No entity candidates detected in this session.{" "}
                <button
                  type="button"
                  onClick={() => setSessionScope("all")}
                  className="underline hover:text-foreground"
                >
                  Show all
                </button>
              </span>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
        {status ? <p className="mt-4 text-sm text-emerald-300">{status}</p> : null}

        {activeTab === "pending" ? (
          <div className="mt-4 space-y-4">
            {selectedSessionId ? (
              <>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Session Entity Review
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Classify entity candidates detected in this session&apos;s transcript before recap generation.
                  </p>
                </div>
                <EntityResolutionPanel
                  sessionId={selectedSessionId}
                  campaignSlug={campaignSlug}
                  searchParams={scopedSearchParams}
                  canWrite={isEditable}
                  onResolutionChange={refreshRegistry}
                />
              </>
            ) : (
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4 text-center">
                <p className="text-sm text-amber-200/90">
                  Select a session in the Chronicle to review entity candidates.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Session-scoped candidate review is the primary attribution workflow.
                </p>
              </div>
            )}
            {filteredPending.length > 0 ? (
              <details className="group" open={!selectedSessionId}>
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  Campaign-Wide Pending ({filteredPending.length})
                </summary>
                <div className="mt-3 space-y-3">
                {filteredPending.map((item) => (
              <div key={item.key} className="rounded-lg border border-border/60 bg-background/35 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{item.display}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.count} total / {item.primaryCount} primary
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={isPending || !isEditable || (pendingPromoteCategory === "pcs" && (!hasKnownDiscordUsers || !pendingPromoteDiscordUserId.trim()))} onClick={() => handlePendingAccept(item.key, pendingPromoteCategory)} className="control-button-ghost rounded-full px-3 py-1 text-xs uppercase tracking-wider">Accept</button>
                    <button type="button" disabled={isPending || !isEditable} onClick={() => handlePendingReject(item.key)} className="control-button-ghost rounded-full px-3 py-1 text-xs uppercase tracking-wider">Reject</button>
                    <button type="button" disabled={isPending || !isEditable} onClick={() => handlePendingDelete(item.key)} className="control-button-danger rounded-full px-3 py-1 text-xs uppercase tracking-wider">Delete</button>
                  </div>
                </div>
                <label className="mt-2 block text-xs uppercase tracking-wider text-muted-foreground">
                  Promote Category
                  <select
                    value={pendingPromoteCategory}
                    onChange={(event) => {
                      setPendingPromoteCategory(event.currentTarget.value as RegistryCategoryKey);
                      setPendingPromoteDiscordUserId("");
                    }}
                    className="control-select mt-1 w-full max-w-xs rounded-md px-2 py-1 text-xs normal-case tracking-normal"
                  >
                    <option value="pcs">PC</option>
                    <option value="npcs">NPC</option>
                    <option value="locations">Location</option>
                    <option value="factions">Faction</option>
                    <option value="misc">Misc</option>
                  </select>
                </label>
                {pendingPromoteCategory === "pcs" ? (
                  <label className="mt-2 block text-xs uppercase tracking-wider text-muted-foreground">
                    Played by
                    <select
                      value={pendingPromoteDiscordUserId}
                      onChange={(event) => setPendingPromoteDiscordUserId(event.currentTarget.value)}
                      className="control-select mt-1 w-full max-w-xs rounded-md px-2 py-1 text-xs normal-case tracking-normal"
                      disabled={!hasKnownDiscordUsers}
                    >
                      {pendingPcSelection.options.map((option) => (
                        <option key={`pending-${option.value || "__placeholder__"}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block normal-case tracking-normal text-muted-foreground">
                      {pendingPcSelection.helperText ?? "Choose the observed Discord user who plays this PC."}
                    </span>
                  </label>
                ) : null}
                {item.examples.length > 0 ? (
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {item.examples.slice(0, 2).map((example, index) => (
                      <p key={`${item.key}-${index}`}>• {example}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : activeTab === "ignore" ? (
          <div className="mt-4">
            {filteredIgnore.length === 0 ? <p className="text-sm text-muted-foreground">No ignored tokens.</p> : null}
            {filteredIgnore.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {filteredIgnore.map((token) => (
                  <span key={token} className="rounded-full border border-border/70 bg-background/40 px-3 py-1 text-xs">
                    {token}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredEntities.length === 0 ? <p className="text-sm text-muted-foreground">No entries in this category.</p> : null}
            {filteredEntities.map((entity) => {
              const isEditing = editingEntryId === entity.id;
              return (
                <div key={entity.id} className="rounded-lg border border-border/60 bg-background/35 p-4">
                  {isEditing ? (
                    <form id={`edit-form-${entity.id}`} className="space-y-2">
                      <label className="block text-xs uppercase tracking-wider text-muted-foreground">
                        Canonical Name
                        <input
                          name="canonicalName"
                          defaultValue={entity.canonicalName}
                          className="control-input mt-1 w-full rounded-md px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="block text-xs uppercase tracking-wider text-muted-foreground">
                        Aliases (comma-separated)
                        <input
                          name="aliases"
                          defaultValue={entity.aliases.join(", ")}
                          className="control-input mt-1 w-full rounded-md px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="block text-xs uppercase tracking-wider text-muted-foreground">
                        Notes
                        <input
                          name="notes"
                          defaultValue={entity.notes}
                          className="control-input mt-1 w-full rounded-md px-3 py-2 text-sm"
                        />
                      </label>
                      {entity.category === "pcs" ? (() => {
                        const selection = buildPcDiscordUserSelectionModel({
                          knownUsers: initialSeenDiscordUsers,
                          currentDiscordUserId: entity.discordUserId,
                        });
                        return (
                          <label className="block text-xs uppercase tracking-wider text-muted-foreground">
                            Played by
                            <select
                              name="discordUserId"
                              defaultValue={selection.initialValue}
                              className="control-select mt-1 w-full rounded-md px-3 py-2 text-sm"
                              disabled={selection.saveBlockedByEmptyState}
                              required
                            >
                              {selection.options.map((option) => (
                                <option key={`${entity.id}-${option.value || "__placeholder__"}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <span className="mt-1 block normal-case tracking-normal text-muted-foreground">
                              {selection.helperText ?? "Choose the observed Discord user who plays this PC."}
                            </span>
                          </label>
                        );
                      })() : null}
                      <div className="flex gap-2 pt-1">
                        <button type="button" disabled={isPending || !isEditable} onClick={() => handleSaveEntry(entity)} className="rounded-full button-primary px-3 py-1 text-xs uppercase tracking-wider">Save</button>
                          <button type="button" disabled={isPending || !isEditable} onClick={() => setEditingEntryId(null)} className="control-button-ghost rounded-full px-3 py-1 text-xs uppercase tracking-wider">Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{entity.canonicalName}</p>
                        <p className="text-xs text-muted-foreground">{entity.id}</p>
                        {entity.aliases.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">Aliases: {entity.aliases.join(", ")}</p> : null}
                        {entity.notes ? <p className="mt-1 text-xs text-muted-foreground">Notes: {entity.notes}</p> : null}
                        {entity.category === "pcs" ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Played by:{" "}
                            {entity.discordUserId
                              ? (seenUserLabelById.get(entity.discordUserId) ?? UNKNOWN_STORED_MAPPING_LABEL)
                              : "Unassigned legacy mapping"}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => toggleAppearances(entity.id)} className="control-button-ghost rounded-full px-3 py-1 text-xs uppercase tracking-wider">
                          {expandedAppearanceId === entity.id ? "Hide Chronicle" : "Chronicle"}
                        </button>
                        <button type="button" disabled={isPending || !isEditable} onClick={() => setEditingEntryId(entity.id)} className="control-button-ghost rounded-full px-3 py-1 text-xs uppercase tracking-wider">Edit</button>
                        <button type="button" disabled={isPending || !isEditable} onClick={() => handleDeleteEntry(entity)} className="control-button-danger rounded-full px-3 py-1 text-xs uppercase tracking-wider">Delete</button>
                      </div>
                    </div>
                    {expandedAppearanceId === entity.id ? (
                      <div className="mt-3 border-t border-border/40 pt-3">
                        {appearanceLoading && !appearanceCache[entity.id] ? (
                          <p className="text-xs text-muted-foreground">Loading appearances…</p>
                        ) : (appearanceCache[entity.id]?.length ?? 0) === 0 ? (
                          <p className="text-xs text-muted-foreground">No session appearances recorded yet.</p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Appeared in {appearanceCache[entity.id]!.length} session{appearanceCache[entity.id]!.length === 1 ? "" : "s"}
                            </p>
                            {appearanceCache[entity.id]!.map((a) => (
                              <div key={a.sessionId} className="rounded-md border border-border/40 bg-background/25 px-3 py-2 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">
                                    {formatSessionDisplayTitle({
                                      label: a.sessionLabel,
                                      sessionId: a.sessionId,
                                    })}
                                  </span>
                                  <span className="text-muted-foreground">{a.mentionCount} mention{a.mentionCount === 1 ? "" : "s"}</span>
                                </div>
                                {a.sessionDate ? <p className="mt-0.5 text-muted-foreground">{a.sessionDate}</p> : null}
                                {a.excerpt ? <p className="mt-1 text-muted-foreground italic">&ldquo;{a.excerpt}&rdquo;</p> : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {isEditable ? (
      <section className="rounded-xl card-glass p-5">
        <button
          type="button"
          onClick={() => setIsCreateExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-serif text-foreground hover:text-foreground/80"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border/60 text-xs leading-none">
            {isCreateExpanded ? "−" : "+"}
          </span>
          Add Canonical Entry
        </button>
        {isCreateExpanded ? (
        <>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Category</span>
            <select
              value={newCategory}
              onChange={(event) => setNewCategory(event.currentTarget.value as RegistryCategoryKey)}
              className="control-select w-full rounded-md px-3 py-2"
            >
              <option value="pcs">PCs</option>
              <option value="npcs">NPCs</option>
              <option value="locations">Locations</option>
              <option value="factions">Factions</option>
              <option value="misc">Misc</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Canonical Name</span>
            <input
              value={newCanonicalName}
              onChange={(event) => setNewCanonicalName(event.currentTarget.value)}
              className="control-input w-full rounded-md px-3 py-2"
              placeholder="e.g. Captain Rowan"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span>Aliases (comma-separated)</span>
            <input
              value={newAliases}
              onChange={(event) => setNewAliases(event.currentTarget.value)}
              className="control-input w-full rounded-md px-3 py-2"
              placeholder="Rowan, Captain"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span>Notes</span>
            <input
              value={newNotes}
              onChange={(event) => setNewNotes(event.currentTarget.value)}
              className="control-input w-full rounded-md px-3 py-2"
              placeholder="Optional"
            />
          </label>
          {newCategory === "pcs" ? (
            <label className="space-y-1 text-sm md:col-span-2">
              <span>Played by</span>
              <select
                value={newDiscordUserId}
                onChange={(event) => setNewDiscordUserId(event.currentTarget.value)}
                className="control-select w-full rounded-md px-3 py-2"
                disabled={!hasKnownDiscordUsers}
                required
              >
                {createPcSelection.options.map((option) => (
                  <option key={option.value || "__placeholder__"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {createPcSelection.helperText ?? "Choose the observed Discord user who plays this PC."}
              </p>
            </label>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleCreateEntry}
          disabled={isPending || (newCategory === "pcs" && (!hasKnownDiscordUsers || !newDiscordUserId.trim()))}
          className="mt-4 rounded-full button-primary px-4 py-2 text-xs font-bold uppercase tracking-wider"
        >
          Add Entry
        </button>
        </>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}
