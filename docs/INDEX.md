LLM ENTRYPOINT:
This document serves as the canonical starting point for repository documentation traversal.
LLM tools should read this file first to locate subsystem documentation.

# Documentation Index

This is the single router for active documentation. Start here, then follow only the linked branch relevant to the task.

## Canonical Core

- [MAP.md](MAP.md) - Conceptual architecture and subsystem boundaries.
- [REPO_SKELETON.md](REPO_SKELETON.md) - Repository layout and where systems live.
- [CURRENT_STATE.md](CURRENT_STATE.md) - Pure present-tense operational truth.
- [COMMAND_NAMESPACE.md](COMMAND_NAMESPACE.md) - Canonical public vs internal naming rules.
- [../NORTH_STAR.md](../NORTH_STAR.md) - Product philosophy and long-term direction (Phase B target path: `docs/NORTH_STAR.md`).

## Operational Onboarding

- [START_HERE.md](START_HERE.md) - P0 onboarding contract and success criteria.
- [runtime/OPS_TRIAGE.md](runtime/OPS_TRIAGE.md) - Closed alpha operational triage checklist.
- [../OAUTH_PROD_HARDENING.md](../OAUTH_PROD_HARDENING.md) - Production OAuth hardening and incident guardrails.

## Runtime And Deployment

- [runtime/OPS_RUNBOOK.md](runtime/OPS_RUNBOOK.md) - Runtime operations playbook.
- [runtime/ops/ENV.md](runtime/ops/ENV.md) - Runtime and deploy environment contract.
- [runtime/ops/DEPLOY_FLOW.md](runtime/ops/DEPLOY_FLOW.md) - Deploy pipeline reference.
- [runtime/ops/PRODUCTION_RUNBOOK.md](runtime/ops/PRODUCTION_RUNBOOK.md) - Production operations.
- [runtime/ops/KNOWN_DEPLOY_FAILURES.md](runtime/ops/KNOWN_DEPLOY_FAILURES.md) - Known deploy failure modes.
- [runtime/ops/PROD_COMMAND_AUTODEPLOY_HANDOFF.md](runtime/ops/PROD_COMMAND_AUTODEPLOY_HANDOFF.md) - Command autodeploy handoff.

## Systems

- [systems/awakening/ARCHITECTURE.md](systems/awakening/ARCHITECTURE.md) - Awakening runtime architecture.
- [systems/awakening/SCRIPTS.md](systems/awakening/SCRIPTS.md) - Awakening script contract.
- [ONBOARDING-CAMPAIGN-REGISTRY.md](ONBOARDING-CAMPAIGN-REGISTRY.md) - Campaign registry model.
- [STARSTORY_SHELL_RESET.md](STARSTORY_SHELL_RESET.md) - Full shell reset and Chronicle architecture overhaul on the current branch.
- [CHRONICLE_COMPENDIUM_ENTITY_OVERHAUL_B2.md](CHRONICLE_COMPENDIUM_ENTITY_OVERHAUL_B2.md) - Chronicle and Compendium entity detection and scanner overhaul.
- [systems/CAUSAL_CORE_PHYSICS.md](systems/CAUSAL_CORE_PHYSICS.md) - Causal model contract.
- [OVERLAY.md](OVERLAY.md) - OBS overlay architecture.
- [MISSIONS_V0.md](MISSIONS_V0.md) - Mission economy surface.
- [LAB_COMMANDS.md](LAB_COMMANDS.md) - `/lab` dev command surface and gating rules.
- [MEGAMEECAP_CANONIZATION_BLUEPRINT.md](MEGAMEECAP_CANONIZATION_BLUEPRINT.md) - Canonical recap convergence plan.
- [MEGAMEECAP_WORKER.md](MEGAMEECAP_WORKER.md) - MegaMeecap worker contract.

## Recap Convergence Track

- [RECAP_SURFACE_MAP.md](RECAP_SURFACE_MAP.md) - Current recap truth, compatibility lanes, and drift risks.
- [RECAP_API_CONTRACT_C1.md](RECAP_API_CONTRACT_C1.md)
- [RECAP_COMPAT_FREEZE_B1.md](RECAP_COMPAT_FREEZE_B1.md)
- [RECAP_RUNTIME_CONVERGENCE_A1.md](RECAP_RUNTIME_CONVERGENCE_A1.md)
- [RECAP_SERVICE_BOUNDARY_A2.md](RECAP_SERVICE_BOUNDARY_A2.md)
- [RECAP_LIFECYCLE_A3.md](RECAP_LIFECYCLE_A3.md)

## Product Surface

- [product/README.md](product/README.md) - Product-docs branch and philosophy-location note.
- [../README.md](../README.md) - Repository entry and quick-start commands.
- [../apps/web/README.md](../apps/web/README.md) - Web archive runtime and route surface.

## Working Notes And Historical Material

- [notes/](notes/) - Research and implementation notes (not canonical contracts).
- [archive/old/README.md](archive/old/README.md) - Historical handoff index.
- Completed closed-alpha phase docs (CLOSED_ALPHA_PHASE0, PHASE5, TRACK_C_RUN5, V1_5_REALIGNMENT) are archived under [archive/](archive/).