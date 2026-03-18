# v1.6.0 Release Checklist

This checklist is the source of truth for shipping `v1.6.0`.

## What Success Means

- This release is a documentation hardening and repo cleanup release.
- Public runtime behavior remains stable: `/starstory` is still the public command surface and `/lab` remains dev-gated.
- CI must prove the repo is internally consistent; manual checks confirm that live runtime behavior still matches the documented contract.
- Recap validation is not asking "did every recap system converge"; it is asking whether canonical recap paths still work, compatibility lanes remain safe, and session end stays decoupled from recap failure.
- Deploy validation is not asking for a new rollout path; it is asking whether the existing verify -> deploy flow remains aligned with the shipped code and command schema.

## 0) Release Posture

- Public release version is `v1.6.0`.
- Internal milestone references (v1.0 through v1.10.1) are preserved in CHANGELOG as historical markers.
- Doc hardening and repo cleanup sprint is the primary content of this release.
- No breaking runtime changes.

## 1) Automated Ship Gate

- Run `npm run ci:verify`
- Gate must pass all of the following in order:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:smoke`
  - `npm run test`
  - `npm run stopline:no-getdb-runtime`
  - `npm run stopline:active-session-boundary`
  - `npm run stopline:runtime-scope-fallbacks`
  - `npm run stopline:observability-runtime`
  - `npm run stopline:no-raw-env`
  - `npm run stopline:repo-hygiene`

## 2) Deterministic Smoke Tests

- `src/tests/smoke/test-megameecap-fixture.ts`
  - Uses fixture transcript only
  - No network / no LLM API calls
  - Verifies output shape and file writes
- `src/tests/smoke/test-silver-seq-fixture.ts`
  - Uses fixture transcript only
  - No network calls
  - Verifies deterministic segmentation + artifact set
- `src/tests/voice/test-voice-interrupt.ts`
  - Verifies playback interrupt on user speech start

Fixture root:

- `src/tests/fixtures/sessions/fixture_v1/`

## 3) Manual Checks (Required)

Read this section in two buckets:

- Core release contract: lifecycle, voice interrupt, deploy, and repo integrity must remain stable.
- Recap compatibility contract: recap generation/read paths may still include compatibility lanes, but they must remain understandable and non-blocking.

- Voice interrupt sanity:
  - Active playback is interrupted by live user speech in immediate mode
  - Speaking state clears after interrupt
- Silver-Seq artifact sanity:
  - `params.json`, `transcript_hash.json`, `eligible_mask.json`, `segments.json`, `metrics.json` are present
- MegaMeecap artifact sanity:
  - Baseline markdown + meta JSON always written
  - Final output written when final pass is enabled
- Legacy recap compatibility sanity:
  - `/meepo sessions list` shows kind + recap status metadata for compatibility surfaces
  - `/meepo sessions view session:<id>` shows base cache status + most recent final recap metadata
  - `/meepo sessions recap session:<id> style:<pass>` generates recap only for canon/non-lab sessions
  - Base validity uses `source_hash + base_version`; final validity uses `source_hash + final_style + final_version`
  - Base file cache is reusable across final style changes
  - DB contains one `recap_final` row per session (new style overwrites canonical most recent final)
  - Ambient or lab sessions return friendly canon-only refusal
  - Top-level `/meepo recap` is not present
  - Cache invalidation: base regenerates on hash/version mismatch or missing files; final regenerates on style/version mismatch, missing files, or `force:true`

## 4) Release Metadata

- `CHANGELOG.md` contains v1.6.0 release entry with doc hardening scope
- Version in `package.json` is `1.6.0`
- Tag readiness: `v1.6.0`

## 5) Go / No-Go

- Go only if:
  - CI gate passes end-to-end
  - Manual checks pass
  - Known gaps are explicitly documented

## 5.1) Deploy Workflow

- GitHub deployment workflow exists at `.github/deploy.yml`.
- Expected pipeline behavior:
  - `verify` runs `npm run ci:verify`
  - `deploy` runs on `main` after verify succeeds
- Local command registration remains available via `npm run dev:deploy` and should use REST-only deploy path.

## 5.2) Awakening Logging Note

- Current awaken runtime includes extensive structured diagnostics for interaction lifecycle hardening.
- During active `/starstory awaken` testing, logs are expected to be chatty; verify key error markers are preserved.
- If terminal noise obscures signal, confirm noisy markers are at `debug` and stage/error signals remain visible.

## 5.3) Lifecycle Contract Alignment

- Runtime contract terms are used consistently in docs and operator notes:
  - `Dormant`
  - `Awakened`
  - `Ambient` (behavior within awakened/no-session)
  - `Showtime`
- Command contract checks:
  - `/starstory awaken` is one-time initialization and does not start a showtime session
  - repeat `/starstory awaken` is harmless guidance
  - `/starstory showtime start` rejects duplicate active-session starts
  - `/starstory showtime end` succeeds independently from async artifact generation failures
- Legacy wizard-flow checks:
  - old awaken component interactions are unreachable in production flow and return migration guidance

## 5.4) Boot Recovery & Crash Safety (Sprint 4)

- Startup runs recovery before reconciliation:
  - recovery mutates DB truth (`active -> interrupted` when needed)
  - reconciliation derives runtime state from post-recovery DB
- Boot logging includes:
  - `[BOOT] Recovering interrupted sessions...`
  - `[BOOT] Marked interrupted: session_id=...`
  - `[BOOT] Recovery complete.`
- Session safety checks:
  - lingering `active` sessions from crashes become `interrupted`
  - `completed` sessions are unchanged by recovery
  - interrupted sessions do not block a fresh showtime start
  - no duplicate active session per guild

## 5.5) Multi-Guild Reliability (v1.5)

- Isolation checks:
  - runtime queries are guild-scoped (`guild_id`) and campaign-scoped DB routing is enforced
  - no silent campaign fallback across guild/campaign boundaries
- Session safety checks:
  - `sessions.status` transitions are constrained to `active -> completed` and `active -> interrupted`
  - duplicate active session starts are rejected (DB + command guards)
- Cost/rate guardrails:
  - recap requests enforce dedupe/capacity/cooldown protections
  - recall request throttles and queue backpressure are active
- User-facing failure contract:
  - memory/recall/recap failures return safe user copy with error code and optional trace id
  - raw stack traces are not surfaced to users

## 5.6) Recap Contract Hardening (Run 3)

- Contract tests:
  - explicit tests validate all-three-view persistence and retrieval (`concise|balanced|detailed`)
  - repeated generation/regeneration verifies overwrite semantics while preserving `created_at_ms`
- Backward compatibility:
  - existing `/meepo sessions recap` command contract tests remain green (no command cutover in Run 3)
- Tooling:
  - `npm run recap:test -- --guild <guild_id> --session <session_id>` prints the stored canonical recap contract
  - `--regenerate [--reason <text>]` path overwrites safely and records regeneration context
- Migration note:
  - `session_recaps` is canonical multi-view recap store
  - `session_artifacts` remains compatibility lane until a later production cutover

## 5.7) Deploy/Runtime Asset Versioning

- In-repo deploy hook exists and is referenced by CI deploy:
  - `deploy/ec2/deploy-meepo.sh`
  - `.github/deploy.yml`
- In-repo host install helper exists:
  - `deploy/ec2/install-runtime-assets.sh`
- In-repo systemd unit definitions exist:
  - `deploy/systemd/meepo-bot.service`
  - `deploy/systemd/meepo-web.service`
- In-repo env templates exist:
  - `deploy/env/meepo-bot.env.example`
  - `deploy/env/meepo-web.env.example`
- Host procedure and checks are documented in `docs/archive/CLOSED_ALPHA_PHASE5_DEPLOY_RUNTIME_VERSIONING.md` (archived).

## 6) GitHub Release Draft (v1.6.0)

### Release Title

`StarStory v1.6.0 - Doc Hardening & Repo Cleanup`

### Release Notes

StarStory `v1.6.0` is a documentation hardening and repository cleanup release.
No runtime, command surface, or database schema changes are included.

#### What's in v1.6.0

- Declared v1.6.0 as the canonical public release target; internal milestones (v1.0-v1.10.1) preserved as historical markers.
- Archived completed closed-alpha and track-closeout docs out of active surfaces.
- Removed `apps/web/legacy-vite/` quarantine subtree.
- Cleaned stale analysis artifacts from `runs/`.
- Refreshed canonical doc router (INDEX.md), system map (MAP.md), current state, release checklist, README, and START_HERE.
- Regenerated REPO_SKELETON.md from live repo.
- Re-validated doc link graph and removed safe redirect stubs.
- All stoplines and CI gates pass unchanged.

#### Install / Runtime Notes

- Version: `1.6.0`
- Runtime: Node.js `22` recommended.
- Required credentials: `DISCORD_TOKEN`, `OPENAI_API_KEY`.
- Core startup:
  - `npm install`
  - `npm run dev:deploy`
  - `npm run dev:bot`
