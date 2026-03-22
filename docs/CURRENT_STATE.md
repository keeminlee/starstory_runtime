# StarStory Platform - Current State

This document is present-tense operational truth only.
History, rollout sequencing, and milestone narrative belong in [../CHANGELOG.md](../CHANGELOG.md).

For documentation traversal, start at [INDEX.md](INDEX.md).
For command naming rules, read [COMMAND_NAMESPACE.md](COMMAND_NAMESPACE.md).

## Current Product Posture

- Public platform name: StarStory.
- Web archive name: Chronicle.
- Canonical public web origin: `https://starstory.online`.
- Legacy public web origin: `https://meepo.online` redirects to `https://starstory.online`.
- Public Discord root command: `/starstory`.
- Dev-only command root: `/lab`.
- Primary product surfaces are Discord runtime plus the web archive under `apps/web`.
- Runtime is voice-first and session-first; recap and offline artifact generation are supporting systems, not the primary live loop.

## Current Public Discord Surface

Public root:

- `/starstory`

Public subcommands/groups:

- `awaken`
- `showtime`
- `settings`
- `help`
- `status`

Deliberately not public:

- `sessions`
- `talk`
- `hush`

## Current Runtime Contract

- `/starstory awaken` is minimal bootstrap. It marks the guild as awakened and seeds canonical essentials when missing.
- `/starstory showtime start` starts a showtime session, accepts optional `campaign` or `campaign_name` selectors, and otherwise reuses an existing showtime campaign or auto-creates `Campaign Alpha` when none exists.
- The resulting session always binds to an explicit showtime campaign scope and joins the invoker voice channel in listen-only mode.
- `/starstory showtime end` finalizes the active session and is expected to succeed independently from downstream recap or artifact failures.
- Only one active session per guild is allowed.
- Voice speaking/performance behavior remains disabled in the public lifecycle; the runtime acts as a silent witness during live capture.

## Current Lifecycle States

- `Dormant`: guild has not completed bootstrap.
- `Awakened`: guild bootstrap is complete.
- `Ambient`: awakened guild with no active showtime session.
- `Showtime`: one active session is in progress.

## Current Data And Scope Rules

- Canonical runtime scope is guild-first.
- Canonical campaign identity is `guild_id + campaign_slug`.
- `guild_config.meta_campaign_slug` is the durable ambient guild scope and is not a user-facing showtime campaign.
- Showtime sessions bind to explicit showtime campaigns, not inferred ambient scope.
- Canonical campaign artifact roots are guild-scoped directories: `g_<guild>__c_<campaign>`.
- Legacy slug-only path handling is compatibility-read fallback only.

## Current Web Archive Surface

Primary user routes:

- `/`
- `/dashboard`
- `/settings`
- `/campaigns/[campaignSlug]/sessions`
- `/campaigns/[campaignSlug]/sessions/[sessionId]`
- `/campaigns/[campaignSlug]/compendium`

Current Chronicle and Compendium entity posture:

- Chronicle recap rendering and recap annotation share one line-normalization path.
- Chronicle panel spacing is slightly tighter than earlier archive-shell defaults.
- Compendium `Current Session` entity filtering is transcript-backed and includes both unresolved candidates and known canonical entity hits.
- Campaign pending review data is session-aware and sourced from durable YAML, not rebuilt ad hoc in the UI.
- The Compendium entity list does not expose a Chronicle drill-in button until a real product flow exists.

Web authority rules:

- Web auth is Discord OAuth via Auth.js.
- Authorization is filtered by `authorizedGuildIds`.
- Slug-only routes are compatibility surface only; canonical campaign identity remains `guild_id + campaign_slug`.
- Session detail, transcript, recap, and regenerate actions enforce ownership in readers/actions, not route handlers.

## Current Deployment And Operations Posture

- The canonical verification gate is `npm run ci:verify`.
- Production deploy flow is documented in [runtime/ops/DEPLOY_FLOW.md](runtime/ops/DEPLOY_FLOW.md).
- Production operations live in [runtime/ops/PRODUCTION_RUNBOOK.md](runtime/ops/PRODUCTION_RUNBOOK.md).
- Deployment failure modes live in [runtime/ops/KNOWN_DEPLOY_FAILURES.md](runtime/ops/KNOWN_DEPLOY_FAILURES.md).
- Slash-command deployment handoff lives in [runtime/ops/PROD_COMMAND_AUTODEPLOY_HANDOFF.md](runtime/ops/PROD_COMMAND_AUTODEPLOY_HANDOFF.md).

## Current Recap Posture

- The recap subsystem is still the highest-entropy surface in the repo.
- Non-recap docs should state only stable recap truth:
  - canonical recap storage is `session_recaps`
  - compatibility lanes still exist
  - session end must not depend on recap success
- Detailed recap convergence, fallback drift, and compatibility behavior are tracked in [RECAP_SURFACE_MAP.md](RECAP_SURFACE_MAP.md) and the recap-track docs linked from [INDEX.md](INDEX.md).
- Chronicle and Compendium entity-overhaul details are tracked in [CHRONICLE_COMPENDIUM_ENTITY_OVERHAUL_B2.md](CHRONICLE_COMPENDIUM_ENTITY_OVERHAUL_B2.md).

## Current Constraints

- Public namespace is `/starstory`; internal `meepo` naming can still exist in code, storage, environment variables, and compatibility layers.
- Production conversational text replies are disabled for non-dev users; slash commands and voice/session flows are the primary interaction surfaces.
- Dev bypass for web scope override is allowed only in non-production with explicit `DEV_WEB_BYPASS=1`.

## Source Of Truth Routing

- Product direction: [../NORTH_STAR.md](../NORTH_STAR.md)
- Architecture mental model: [MAP.md](MAP.md)
- Namespace doctrine: [COMMAND_NAMESPACE.md](COMMAND_NAMESPACE.md)
- Onboarding contract: [START_HERE.md](START_HERE.md)
- Runtime ops: [runtime/OPS_RUNBOOK.md](runtime/OPS_RUNBOOK.md)
- Recap convergence: [RECAP_SURFACE_MAP.md](RECAP_SURFACE_MAP.md)