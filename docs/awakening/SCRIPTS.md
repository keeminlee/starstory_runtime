# Awakening Scripts Guide

## Purpose

Awakening scripts define deterministic onboarding and ritual flows as versioned YAML scene graphs.

Runtime executes script logic; scripts describe intent.

## Script Shape

Each script declares:

- `id`
- `version`
- `start_scene`
- `scenes`

Each scene can define:

- `say`
- `prompt`
- `commit`
- `action`
- `requires`
- `fallback_next`
- `next`

`channel_select` scenes may define:

- `on_change.if_different_channel.departure`
- `on_change.if_different_channel.arrival`

## Capability Gating

`requires` lists capabilities needed for a scene.

If required capabilities are missing, the engine deterministically skips the scene and moves to `fallback_next` (or `next` when valid).

This allows forward-compatible scripts while preserving deterministic progression.

## Prompt Primitives

Supported prompt types:

- `choice`
- `modal_text`
- `role_select`
- `channel_select`
- `registry_builder`

Prompt values persist to `progress_json[key]` after nonce-validated submission.

## Commits

Commits are declarative script instructions.

Engine executes commit side effects after prompt persistence, before actions.

Common commit types:

- `set_flag`
- `set_guild_config`
- `write_memory`
- `append_registry_yaml`

## Actions

Actions run after commits, in script order.

Supported action:

- `join_voice_and_speak`

Actions are non-blocking for scene progression and do not mutate `progress_json` directly.

## Registry Builder Runtime Keys

Registry builder uses two progress keys for deterministic resume:

- `progress_json.players` — finalized entries.
- `progress_json._rb_pending_character_name` — temporary name awaiting user selection.

Resume rule:

If `_rb_pending_character_name` exists, the runtime re-renders the player selection step instead of reopening the name prompt.

## Authoring Guidance

- Keep scene transitions explicit.
- Keep prompts minimal and deterministic.
- Use commits for persistent state mutation, not prompt handlers.
- Use actions for side effects only.
- Prefer stable keys and versioned script upgrades over in-place behavioral drift.
