# Chronicle And Compendium Entity Overhaul B2

This document captures the branch-level overhaul that tightened entity detection, moved pending review toward durable per-session evidence, and aligned Chronicle and Compendium surfaces with the new data model.

## Outcome

- Pending candidate generation is now transcript-first, session-aware, and less permissive.
- Known canonical entity hits are preserved as first-class scan output instead of being discarded during session review.
- Chronicle and Compendium now consume the same normalized recap-line behavior.
- Compendium session filtering uses persisted session evidence rather than a UI-local approximation.
- The Compendium entity row no longer shows a Chronicle button for a path that is not product-ready.

## Detection Model Changes

### Bronze-first transcript selection

- `src/registry/scanNamesCore.ts` now prefers `bronze_transcript` over `ledger_entries` when choosing rows to scan.
- `src/tools/registry/scan-names.ts` loads transcript rows per session and records the session count used for the build.
- Campaign-wide pending output is now aggregated from per-session scans, not one flat row bag.

### Sentence-initial suppression

- Capitalized phrases at sentence-initial positions are tracked separately via `sentenceInitialCount`.
- Sentence-initial hits do not contribute toward pending-candidate promotion thresholds.
- Detection covers start-of-string, sentence punctuation, newlines, bullet markers, and numbered list markers.

### Phrase-first span handling

- Scanning now uses position-aware regex matching with `matchAll`.
- The regex naturally preserves the longest contiguous capitalized phrase, so shorter child tokens are not double-counted inside the same span.
- No post-hoc global merge pass is used.

## Pending YAML Contract

`decisions.pending.yml` is now version 2 and remains the durable pending-review source.

New shape additions:

- `pending[].sentenceInitialCount`
- `pending[].sessions[]`
- top-level `knownHits[]`

`knownHits` is intentionally separate from `pending`:

- `pending` means unresolved review work
- `knownHits` means canonical entities already in the registry but observed in transcript evidence

The scanner also supports `--rebuild` to wipe and regenerate the pending file from the current transcript corpus.

## Web DTO And API Changes

### Registry snapshot DTOs

- `apps/web/lib/registry/types.ts` extends pending items with `sentenceInitialCount` and session breakdowns.
- Registry snapshots now include `pending.knownHits` for campaign-level known canonical hits.

### Session entity-candidate API

- `apps/web/lib/server/entityResolutionService.ts` now calls the scanner with `includeKnown: true`.
- The session entity-candidate response now returns both:
  - unresolved `candidates`
  - resolved `knownHits`

Known hits are mapped back to canonical registry metadata so the UI can filter by real entity presence, not only unresolved candidate names.

## Chronicle Surface Changes

### Shared recap normalization

- `apps/web/lib/shared/normalizeRecapLines.ts` is now the single normalization path for recap text.
- Both Chronicle recap rendering and server-side annotation use the same normalization rules.
- Leading markdown-style dash bullets are stripped during normalization so client and server line indexing stay aligned.

### Chronicle panel spacing

- `apps/web/components/chronicle/chronicle-recap-pane.tsx` reduces panel padding and tab-bar padding to tighten the reading surface.
- The change is intentionally small in scope: content width and typography stay the same, only surrounding whitespace is reduced.

## Compendium Surface Changes

### Session-aware filtering

- `apps/web/components/campaign/campaign-registry-manager.tsx` merges unresolved session candidates with canonical session `knownHits`.
- In `Current Session` mode, category filtering now includes entities already present in the registry.
- Pending review items are also filtered by persisted per-session evidence rather than campaign-only totals.
- Pending rows display a session-count badge derived from the YAML session breakdown.

### Dead Chronicle affordance removed

- The Compendium entity list no longer renders the `Chronicle` button or the appearance drawer.
- The button previously suggested a supported product flow that is not ready; removing it keeps the surface honest.

## Validation

Validated on this branch with:

```bash
npx vitest run
npx tsc --noEmit
```

At validation time:

- 416 tests passed
- TypeScript emitted no errors

## File Map

Core scanner and CLI:

- `src/registry/scanNamesCore.ts`
- `src/tools/registry/scan-names.ts`
- `src/tests/registry/test-scan-names.ts`

Web server and DTO surface:

- `apps/web/lib/registry/types.ts`
- `apps/web/lib/api/types.ts`
- `apps/web/lib/server/registryService.ts`
- `apps/web/lib/server/entityResolutionService.ts`

Web UI:

- `apps/web/components/chronicle/chronicle-recap-pane.tsx`
- `apps/web/components/campaign/campaign-registry-manager.tsx`
- `apps/web/components/session/recap-tabs.tsx`
- `apps/web/lib/server/recapAnnotationService.ts`
- `apps/web/lib/shared/normalizeRecapLines.ts`
- `apps/web/lib/shared/__tests__/normalizeRecapLines.test.ts`

## Operator Notes

- Rebuild pending state after major scanner changes with `npx tsx src/tools/registry/scan-names.ts --rebuild`.
- Reviewers should interpret `sentenceInitialCount` as evidence quality metadata, not promotion volume.
- `Current Session` in the Compendium now means transcript-backed session presence, including already-known canonical entities.