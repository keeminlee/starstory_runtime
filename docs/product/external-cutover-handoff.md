# External Cutover Handoff

This note covers the remaining out-of-repo follow-up work for the public StarStory cutover. The in-repo canonical host decision is resolved: `starstory.online` is the canonical public origin and `meepo.online` is the compatibility redirect host.

## Scope

The following work should be handled in infrastructure, hosting, proxy, OAuth provider, or deployment environments outside this repository.

## Canonical Host Decision

- Canonical public host is `starstory.online`.
- `www.starstory.online` should resolve to production and redirect to the apex host.
- Legacy public host `meepo.online` should redirect to the matching `starstory.online` route.

## Redirect Direction

- Configure the reverse proxy or edge layer so legacy public traffic redirects to `starstory.online`.
- Ensure redirects are consistent for root routes, auth routes, and app deep links.
- Verify redirect status codes and cache behavior are appropriate for a public cutover.

## OAuth Callback And Origin Alignment

- Update the Discord OAuth application settings so the approved redirect URIs include `https://starstory.online/api/auth/callback/discord`.
- Align `NEXTAUTH_URL`, `AUTH_URL`, and any other origin-sensitive runtime settings with `https://starstory.online`.
- Verify sign-in, sign-out, callback, and session refresh behavior after the host change.

## API Canonical-Origin Alignment

- Update reverse proxy and runtime canonical-origin enforcement so API and web requests agree on the same host.
- Verify any absolute URL generation, callback building, and origin checks use the intended public origin.
- Confirm that redirect-only hosts do not remain accidentally writable or partially canonical.

## Validation Checklist

- Public root loads on the intended canonical host.
- Legacy host redirects to the intended canonical host.
- Discord OAuth sign-in completes successfully on the canonical host.
- Auth callback and session refresh use the same canonical origin.
- Deep links into campaigns, sessions, and settings survive redirects.
- Public slash-command guidance and web links are consistent with the final host decision.

## Notes

- This file does not grant break-glass approval for protected deploy/env files.
- Any protected-path edits should still follow the runtime hotfix protocol in `.github/copilot-instructions.md`.