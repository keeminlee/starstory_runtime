# StarStory Shell Reset — Branch Overhaul

Branch: `feat/starstory-shell-reset`

This document covers the full scope of the shell reset branch, which replaces the sidebar-and-header web archive with a floating-rail campaign shell that hosts two first-class product surfaces: Chronicle and Compendium.

For entity detection and scanner changes specifically, see [CHRONICLE_COMPENDIUM_ENTITY_OVERHAUL_B2.md](CHRONICLE_COMPENDIUM_ENTITY_OVERHAUL_B2.md).
For constellation preservation policy, see [product/homepage-constellation-preservation.md](product/homepage-constellation-preservation.md).

---

## 1. Shell Architecture Reset

### Removed

- `apps/web/components/layout/app-header.tsx` — top navigation bar
- `apps/web/components/layout/app-sidebar.tsx` — persistent left sidebar
- `apps/web/components/campaign/campaign-sessions-actions.tsx` — standalone session action bar

### Added

| Component | Role |
|-----------|------|
| `app-floating-rail.tsx` | Fixed left rail with expandable campaign and settings buttons; responds to auth state |
| `account-control.tsx` | Avatar menu with sign-out; positioned in top-right shell controls |
| `app-shell-controls.tsx` | Top-right container orchestrating campaign selector and account control |

### Layout Posture

- Navigation is a narrow floating rail, not a full sidebar.
- Top-right shell controls replace the old full-width header.
- Content fills the remaining viewport; campaign shell owns its own sub-navigation.
- Mobile: floating rail collapses; campaign selector hides.

---

## 2. Campaign Tabbed Shell

A new route at `/campaigns/[campaignSlug]` hosts a tabbed campaign view that replaces the old sessions-list-only page.

### Components

| Component | Role |
|-----------|------|
| `campaign-page.tsx` | Root shell that coordinates Chronicle/Compendium switching, session selection, constellation state, and campaign header |
| `campaign-header.tsx` | Campaign title (in-place editable), description, and metadata |
| `campaign-mode-toggle.tsx` | Tab switch between Chronicle and Compendium |
| `compendium-surface.tsx` | Conditional wrapper loading CampaignRegistryManager when a registry exists |

### Routing

- `/campaigns/[campaignSlug]` — new campaign home (server page fetches sessions + registry, renders CampaignPage)
- `/campaigns/[campaignSlug]/sessions` — now simplified; redirects to campaign home
- `/campaigns/[campaignSlug]/compendium` — still supported; server page wraps CampaignRegistryManager

### View Model

- Active mode (Chronicle or Compendium) is managed in component state.
- Selected session is tracked by CampaignPage and passed to Chronicle surface.
- Campaign overview section shows campaign metadata, session count, and entity totals inline.

---

## 3. Chronicle Surface

Chronicle is the session reading and timeline surface. It combines a visual session constellation with a recap reading pane.

### Session Constellation

The constellation is an interactive visual timeline where sessions appear as positioned star nodes.

| Component | Role |
|-----------|------|
| `campaign-session-constellation.tsx` | SVG-based constellation renderer with session stars, connecting edges, and an archive drop zone |
| `session-rail-node.tsx` | Individual star node with prominence variants (anchor/major/minor), halo, label, and drag affordances |
| `session-constellation-edge.tsx` | Animated connecting lines between session nodes |
| `use-session-rail-model.ts` | State machine managing layout computation, drag-to-reorder, selection, hover, and archive workflows |

Layout model:

- Sessions are laid out vertically with zig-zag stagger (alternating left/right x-offsets).
- Prominence tiers: first session is `anchor` (largest), next two are `major`, rest are `minor`.
- Edit mode reveals drag handles and an archive zone below the constellation.
- Drag-to-reorder persists via `POST /api/campaigns/[campaignSlug]/session-order`.
- Drag-to-archive uses the existing `POST /api/sessions/[sessionId]/archive` endpoint.

### Chronicle Recap Pane

| Component | Role |
|-----------|------|
| `chronicle-recap-pane.tsx` | Full recap reader with concise/balanced/detailed tabs, speaker attribution panel, and entity preview |
| `chronicle-surface.tsx` | Thin wrapper passing session context to the recap pane |
| `recap-body-renderer.tsx` | Markdown-style recap text renderer |

Recap pane features:

- Three recap fidelity tabs: concise, balanced, detailed.
- Speaker attribution sidebar.
- Inline entity overlay with hover and pinned preview panels.
- Session title in-place editing.
- Recap regeneration trigger.

### Entity Overlay Pipeline

Entity names in recap text are recognized and highlighted with interactive previews.

| Module | Role |
|--------|------|
| `recapEntityOverlay.ts` | Phrase-matching engine mapping canonical entity names and aliases to registry entries and candidates |
| `annotated-recap-renderer.tsx` | Text renderer that applies overlay spans and manages hover/pinned entity preview state |
| `recapEntityOverlay.test.ts` | Unit tests for overlay logic |

Priority rules:

- Longer phrases match before shorter ones.
- Category ordering is applied when multiple entities share a phrase.
- Canonical registry entities take priority over unresolved candidates.

---

## 4. New API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/campaigns/[campaignSlug]/session-order` | `POST` | Persist drag-to-reorder session ordering |
| `/api/sessions/[sessionId]/unarchive` | `POST` | Restore an archived session |

Both routes enforce guild-scope ownership before mutation.

---

## 5. Data Access Layer Expansion

### Archive Read Store

`apps/web/lib/server/readData/archiveReadStore.ts` is a new SQLite read layer providing typed queries for:

- Sessions (with born-star status)
- Transcripts
- Recaps (all fidelity tiers)
- Speaker attribution
- Born stars

Campaign readers (`campaignReaders.ts`) and session readers (`sessionReaders.ts`) expanded significantly to support:

- Session ordering and reorder persistence
- Unarchive operations
- Born-star awareness in session projections
- Homepage sky projection data source

---

## 6. Backend: Session Validation And Star Birth

Two new backend modules support the concept of a "born star" — a session that has been validated and promoted to a visible timeline presence.

| Module | Role |
|--------|------|
| `src/sessions/sessionValidation.ts` | Marks sessions success/failure based on line count and duration thresholds |
| `src/sessions/starBirth.ts` | Creates `born_stars` records for validated sessions; persists to the `born_stars` table |

Schema addition in `src/db/schema.sql`:

- `born_stars` table linking session validation outcome to timeline visibility

---

## 7. Sky Constellation Domain

A full domain model for rendering campaign sessions as a visual star sky was created.

| Module | Role |
|--------|------|
| `skyObserverTypes.ts` | Type contracts: `SkyStarNode`, `SkyLink`, `CampaignVisibleNode`, `ObserverSkyModel` |
| `campaignSkyMapper.ts` | Maps campaigns and sessions to spatial coordinates using hash-based deterministic positioning and prominence tiers |
| `campaignStarVisual.ts` | Derives visual state (glow, size) from star data |
| `observerPresentation.ts` | Computes user-facing presentation (glyph, hint, action text, navigation href) for sky nodes |
| `starData.ts` | Raw star data type |

This system is preserved but intentionally not mounted on the homepage. See [product/homepage-constellation-preservation.md](product/homepage-constellation-preservation.md) for the preservation policy.

Supporting UI components:

- `apps/web/components/sky/HomepageConstellationSection.tsx` — reusable constellation renderer
- `apps/web/components/sky/ObserverTooltip.tsx` — tooltip for star hover state

---

## 8. Dashboard And Landing Redesign

### Dashboard

`apps/web/app/dashboard/page.tsx` is now a smart redirect:

- If the user has campaigns, redirect to the first real campaign page.
- If no campaigns exist, show a minimal empty state.
- The old dashboard session-list UI is removed.

### Landing Page

`apps/web/components/landing/landing-page.tsx` is stripped to a logged-out explanation surface:

- Hero copy explaining StarStory.
- "Start Your Chronicle" call-to-action linking to Discord invite.
- Demo campaign link for unauthenticated browsing.

---

## 9. Verbose Mode

A developer toggle for showing internal identifiers (campaign slug, session IDs, entity keys) in the UI.

| Module | Role |
|--------|------|
| `apps/web/providers/verbose-mode-provider.tsx` | React context hydrating verbose mode from `localStorage` |
| `apps/web/lib/client/verbose-mode.ts` | Read/write utilities for the `localStorage` toggle |

Verbose mode is opt-in and has no production-user visibility.

---

## 10. CSS And Visual Changes

- `apps/web/app/globals.css` — updated with new utility classes and floating-rail layout support.
- `apps/web/components/openalpha/sky/sky.module.css` — expanded constellation and star visual styles.
- `apps/web/components/version-badge.tsx` — updated presentation.
- Campaign overview layout overhauled with inline metadata and session-count display.

---

## Validation

```bash
npx tsc --noEmit
npx vitest run
```

At branch validation time: 416 tests passed, zero TypeScript errors.

---

## File Map

### Shell Layout

- `apps/web/components/layout/app-floating-rail.tsx`
- `apps/web/components/layout/account-control.tsx`
- `apps/web/components/layout/app-shell-controls.tsx`

### Campaign Shell

- `apps/web/app/campaigns/[campaignSlug]/page.tsx`
- `apps/web/components/campaign/campaign-page.tsx`
- `apps/web/components/campaign/campaign-header.tsx`
- `apps/web/components/campaign/campaign-mode-toggle.tsx`
- `apps/web/components/campaign/compendium-surface.tsx`
- `apps/web/components/campaign/campaign-overview.tsx`
- `apps/web/components/campaign/campaign-header-switcher.tsx`

### Chronicle

- `apps/web/components/chronicle/chronicle-surface.tsx`
- `apps/web/components/chronicle/chronicle-recap-pane.tsx`
- `apps/web/components/chronicle/recap-body-renderer.tsx`
- `apps/web/components/chronicle/campaign-session-constellation.tsx`
- `apps/web/components/chronicle/session-rail-node.tsx`
- `apps/web/components/chronicle/session-constellation-edge.tsx`
- `apps/web/components/chronicle/use-session-rail-model.ts`

### Entity Overlay

- `apps/web/components/shared/annotated-recap-renderer.tsx`
- `apps/web/lib/chronicle/recapEntityOverlay.ts`
- `apps/web/lib/__tests__/recapEntityOverlay.test.ts`

### Sky Domain

- `apps/web/lib/starstory/domain/sky/skyObserverTypes.ts`
- `apps/web/lib/starstory/domain/sky/campaignSkyMapper.ts`
- `apps/web/lib/starstory/domain/sky/campaignStarVisual.ts`
- `apps/web/lib/starstory/domain/sky/observerPresentation.ts`
- `apps/web/lib/starstory/domain/sky/starData.ts`
- `apps/web/components/sky/HomepageConstellationSection.tsx`
- `apps/web/components/sky/ObserverTooltip.tsx`

### Data Layer

- `apps/web/lib/server/readData/archiveReadStore.ts`
- `apps/web/lib/server/campaignReaders.ts`
- `apps/web/lib/server/sessionReaders.ts`
- `apps/web/lib/server/demoCampaign.ts`
- `apps/web/lib/auth/primaryAuth.ts`

### Backend

- `src/sessions/sessionValidation.ts`
- `src/sessions/starBirth.ts`
- `src/db/schema.sql`

### API Routes

- `apps/web/app/api/campaigns/[campaignSlug]/session-order/route.ts`
- `apps/web/app/api/sessions/[sessionId]/unarchive/route.ts`

### Utilities

- `apps/web/providers/verbose-mode-provider.tsx`
- `apps/web/lib/client/verbose-mode.ts`

### Deleted

- `apps/web/components/layout/app-header.tsx`
- `apps/web/components/layout/app-sidebar.tsx`
- `apps/web/components/campaign/campaign-sessions-actions.tsx`
