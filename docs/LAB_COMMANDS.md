# Lab Commands

## What `/lab` is

`/lab` is the development-only legacy command surface.

- Intended for internal debugging and legacy command access.
- Normal users should use only the clean `/meepo ...` product surface.

## How `/lab` is gated

`/lab` is protected by two layers:

1. Deploy scope
- Global command deploy excludes `/lab`.
- `/lab` is deployed only to guild IDs listed in `DEV_GUILD_IDS`.

2. Runtime allowlist
- `DEV_USER_IDS` (comma-separated Discord user IDs)

Authorization behavior:
- If a user is not allowlisted by user ID, `/lab` returns an ephemeral denial message.

Moved command surface:
- `/meepo doctor` → `/lab doctor`
- `/meepo sleep` → `/lab sleep`
- `/goldmem` → `/lab goldmem run`
- `/meeps ...` → `/lab meeps ...`
- `/missions ...` → `/lab missions ...`

## Deployment profiles

### Local dev (PowerShell)

```powershell
$env:DEV_USER_IDS="123456789012345678"
$env:DEV_GUILD_IDS="987654321098765432"
npm run deploy:commands
```

### Staging

- Include only your user ID in `DEV_USER_IDS`.
- Set staging guild IDs in `DEV_GUILD_IDS`.

Example:

```powershell
$env:DEV_USER_IDS="123456789012345678"
$env:DEV_GUILD_IDS="987654321098765432"
npm run deploy:commands
```

### Production (PowerShell)

```powershell
npm run deploy:commands
# DEV_USER_IDS should be unset or empty
# DEV_GUILD_IDS should be unset or empty
```

## Troubleshooting

### `/lab` does not appear in slash autocomplete

- Set `DEV_GUILD_IDS` to include the target guild, then run `npm run deploy:commands`.
- Re-run command deployment after changing `DEV_GUILD_IDS`.

### `/lab` appears but returns not authorized

- Check `DEV_USER_IDS` values.
- IDs are comma-separated.
- Spaces are tolerated (values are trimmed), but recommended format is no spaces.
- Verify the calling account ID is exactly present.

## Security note

- `/lab` should remain excluded from global production deploys.
- Recommended default: keep both `DEV_USER_IDS` and `DEV_GUILD_IDS` unset in prod.
- Optional hardening: add a CI/deploy check that fails if production deploy includes unexpected `DEV_GUILD_IDS`.
