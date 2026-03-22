# Homepage Constellation Preservation

The root homepage no longer renders the constellation experience.

This is intentional. The constellation system is being preserved for a future dedicated logged-in product surface, most likely an Observatory-style view.

Reusable entry points kept in place:

- `apps/web/components/sky/HomepageConstellationSection.tsx`: preserved interactive constellation renderer
- `apps/web/lib/starstory/domain/sky/campaignSkyMapper.ts`: campaign/session to spatial sky model mapper
- `apps/web/lib/starstory/domain/sky/observerPresentation.ts`: tooltip and navigation presentation model builder
- `apps/web/lib/starstory/domain/sky/campaignStarVisual.ts`: star visual state derivation
- `apps/web/lib/server/campaignReaders.ts#getHomepageSkyProjection`: server-side campaign/session projection source

Current homepage policy:

- `/` is a stripped-down logged-out explanation and setup surface
- constellation rendering is intentionally not part of that surface
- future product work can move the preserved system onto a dedicated authenticated page without rebuilding the core mechanics