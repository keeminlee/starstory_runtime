# PR: v1.3.1 Hardening Sprint

## Summary

This PR closes the foundational hardening upgrade across reliability, failure UX, and observability.

It completes:

- expensive-job safety rails (dedupe, cooldown semantics, keyed back-pressure)
- user-safe failure contracts (canonical taxonomy + formatter contract)
- observability closure (structured runtime logging + strict runtime stopline enforcement)

## What Changed

### Reliability rails

- recap edge and engine in-flight dedupe
- recap cooldown/rate-limit handling with explicit `force` semantics
- recall throttling and retrieval-shape bounds
- keyed worker/action-family back-pressure (`action_backpressure_retry`, `action_backpressure_skipped`)

### Failure contract rollout

- expanded canonical Meepo error codes
- formatter contract now consistently exposes:
  - `failureClass`
  - `retryable`
  - `correctiveActionRequired`
- applied taxonomy-driven responses to priority command and voice degradation paths

### Observability closure

- normalized strict runtime failure logs to structured logger paths
- added runtime observability stopline:
  - `tools/stopline-observability-runtime.ps1`
  - npm script: `stopline:observability-runtime`
  - wired into `ci:verify`
- added stopline regression test:
  - `src/tests/test-stopline-observability-runtime.ts`
- added ops runbook:
  - `docs/OPS_RUNBOOK.md`

## Why

The system is now both safer and more legible operationally:

- users get categorized/actionable failures instead of vague responses
- expensive paths are protected from duplicate or burst overload behavior
- runtime regressions in strict zones are blocked by policy in CI

## Validation

Focused verification completed during implementation:

- `npm run stopline:observability-runtime`
- `npm run stopline:active-session-boundary`
- `npm run stopline:runtime-scope-fallbacks`
- `npm run stopline:no-getdb-runtime`
- `npx vitest run src/tests/test-stopline-observability-runtime.ts src/tests/test-user-facing-error-formatter.ts src/tests/test-voice-reply-degradation-contract.ts src/tests/test-meepo-sessions-recap-contract.ts`

## Notes

- Non-failure operational events keep stable structured payloads and do not invent failure fields.
- `error_code`/`failure_class` are attached where events/logs represent failures.
