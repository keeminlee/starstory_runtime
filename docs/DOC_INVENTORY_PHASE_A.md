# Documentation Inventory - Phase A (March 10, 2026)

This report is a tag-only inventory for Phase A.
No files are moved or archived in this phase.

Freshness precedence used for conflicts:
1. `CHANGELOG.md`
2. `docs/CURRENT_STATE.md`
3. `docs/START_HERE.md`
4. `docs/MAP.md`
5. Older docs only when needed for missing detail

## Legend

- `active`: Keep in active graph
- `candidate-phaseB`: Candidate for Phase B archive/move after unreferenced check
- `historical-active`: Historical context but still relevant; keep active for now

## Inventory

| Path | Category | Phase A status | Notes |
| --- | --- | --- | --- |
| CHANGELOG.md | core docs | active | Release behavior history, freshness source |
| README.md | core docs | active | Repository entrypoint |
| NORTH_STAR.md | core docs | active | Canonical philosophy in Phase A location |
| OAUTH_PROD_HARDENING.md | operational docs | active | Live production hardening doctrine |
| apps/web/README.md | system documentation | active | Web archive surface |
| apps/web/legacy-vite/README.md | obsolete docs | candidate-phaseB | Legacy implementation reference |
| docs/systems/CAUSAL_CORE_PHYSICS.md | system documentation | active | Canonical causal contract |
| docs/CURRENT_STATE.md | core docs | active | Current operational truth |
| docs/INDEX.md | core docs | active | Canonical LLM router |
| docs/LAB_COMMANDS.md | operational docs | active | Dev/lab command contract |
| docs/MAP.md | core docs | active | Conceptual architecture map |
| docs/MEEPO_PRIME.md | design discussions | active | Forward-looking strategy doc |
| docs/MEGAMEECAP_CANONIZATION_BLUEPRINT.md | system documentation | active | Active convergence plan |
| docs/MEGAMEECAP_WORKER.md | system documentation | active | Worker contract |
| docs/MISSIONS_V0.md | system documentation | active | Mission/economy spec |
| docs/ONBOARDING-CAMPAIGN-REGISTRY.md | system documentation | active | Registry architecture |
| docs/runtime/OPS_RUNBOOK.md | operational docs | active | Runtime operations playbook |
| docs/runtime/OPS_TRIAGE.md | operational docs | active | Live operational triage checklist |
| docs/OVERLAY.md | system documentation | active | Overlay architecture |
| docs/PR_v1.3.1_hardening_sprint.md | design discussions | historical-active | Historical sprint context with still-useful rationale |
| docs/archive/Project_Meepo.md | obsolete docs | archived-phaseB | Moved in Phase B (unreferenced candidate) |
| docs/README.md | core docs | active | Human-friendly docs overview |
| docs/RECAP_API_CONTRACT_C1.md | system documentation | active | Recap API contract |
| docs/RECAP_COMPAT_FREEZE_B1.md | system documentation | active | Recap compatibility contract |
| docs/RECAP_LIFECYCLE_A3.md | system documentation | active | Recap lifecycle contract |
| docs/RECAP_RUNTIME_CONVERGENCE_A1.md | system documentation | active | Runtime convergence plan |
| docs/RECAP_SERVICE_BOUNDARY_A2.md | system documentation | active | Service boundary contract |
| docs/RECAP_SURFACE_MAP.md | system documentation | active | Recap surface map |
| docs/REPO_SKELETON.md | core docs | active | Raw repository layout map |
| docs/START_HERE.md | operational docs | active | P0 onboarding source of truth |
| docs/V1_RELEASE_CHECKLIST.md | operational docs | active | Release gate contract |
| docs/systems/awakening/ARCHITECTURE.md | system documentation | active | Awakening subsystem architecture |
| docs/systems/awakening/SCRIPTS.md | system documentation | active | Awakening scripts contract |
| docs/notes/causal/ARCHITECTURE_CHUNKLESS_LINKS.md | design discussions | historical-active | Useful pivot context; not canonical contract |
| docs/notes/causal/CHUNKLESS_LINKS_INDEX.md | design discussions | active | Active implementation notes |
| docs/notes/causal/IMPLEMENTATION_STATUS_CHUNKLESS_LINKS.md | design discussions | active | Active progress tracker |
| docs/notes/causal/causal-debug.md | design discussions | candidate-phaseB | Debug/sample-oriented note |
| docs/notes/ops/CHANGES_SUMMARY.md | design discussions | active | Ops/causal design decisions |
| docs/notes/ops/LOGGING_REFERENCE.md | operational docs | active | Logging reference |
| docs/archive/old/HANDOFF.md | obsolete docs | archived-phaseB | Moved in Phase B (link-updated archival) |
| docs/archive/old/HANDOFF_MEECAP_FIXES.md | obsolete docs | archived-phaseB | Moved in Phase B (unreferenced candidate) |
| docs/archive/old/HANDOFF_MEEP_MVP.md | obsolete docs | archived-phaseB | Moved in Phase B (unreferenced candidate) |
| docs/archive/old/HANDOFF_V0.md | obsolete docs | archived-phaseB | Moved in Phase B (link-updated archival) |
| docs/archive/old/README.md | obsolete docs | archived-phaseB | Moved in Phase B (link-updated archival index) |
| docs/archive/old/REPO_HYGIENE_2026-02-25.md | obsolete docs | archived-phaseB | Moved in Phase B (unreferenced candidate) |
| docs/runtime/ops/CLOSED_ALPHA_PHASE0_RELEASE_CONTROL.md | operational docs | active | Runtime release-control doctrine |
| docs/runtime/ops/CLOSED_ALPHA_PHASE5_DEPLOY_RUNTIME_VERSIONING.md | operational docs | active | Deploy/runtime versioning contract |
| docs/runtime/ops/ENV.md | operational docs | active | Env contract |
| docs/runtime/ops/TRACK_C_RUN5_CLOSEOUT.md | operational docs | historical-active | Completed track evidence still referenced by ops context |
| docs/runtime/ops/V1_5_CLOSED_ALPHA_REALIGNMENT_KNOWLEDGE_PASS.md | operational docs | active | Surface alignment audit |
| src/causal/CAUSAL_LEVER_MATH.md | system documentation | active | Causal math reference |
| src/causal/INDEX.md | system documentation | active | Causal subsystem index |
| src/causal/SILVER_LANE_OVERVIEW.md | system documentation | active | Silver lane architecture |

## Phase B Candidates (Do Not Move Yet)

- `apps/web/legacy-vite/README.md`
- `docs/notes/causal/causal-debug.md`

Phase B gating rule:
Only archive/move a candidate after verifying it is not required by active `docs/INDEX.md` traversal and has no required inbound references from active docs.
