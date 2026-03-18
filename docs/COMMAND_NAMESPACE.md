# Command Namespace Doctrine

This document is the canonical naming rule for user-facing commands, docs, and operator guidance.

## Public Names

- Platform: `StarStory`
- Archive surface: `Chronicle`
- Public Discord command root: `/starstory`
- Dev-only command root: `/lab`

## Internal Names

Internal code and storage may still use `meepo` in places such as:

- source file names
- database fields and compatibility tables
- environment variable names
- logs and metrics
- legacy command handlers and redirects

Internal `meepo` naming does not make `/meepo` the canonical public command surface.

## Legacy Compatibility

- Legacy `/meepo ...` invocations are compatibility behavior only.
- When legacy paths still exist, docs should describe them as compatibility or internal behavior, not as the primary user surface.
- New docs should not present `/meepo` as the default command root.

## Authoring Rules

- Use `/starstory` for public user instructions.
- Use `/lab` for dev-gated workflows.
- Mention `meepo` only when discussing internal code, storage, compatibility layers, or historical behavior.
- If a doc needs both public and internal naming, state the public rule first and link back to this file.

## Examples

Correct:

- "Run `/starstory awaken` to bootstrap the guild."
- "Internal compatibility layers may still retain `meepo` naming."

Incorrect:

- "Run `/meepo awaken`" in onboarding or public operator docs.
- Mixing `/meepo` and `/starstory` as if both are equally current public surfaces.