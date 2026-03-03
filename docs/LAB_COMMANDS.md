# Lab Commands

## What `/lab` is

`/lab` is the development-only legacy command surface.

- Intended for internal debugging and legacy command access.
- Not registered by default.
- Normal users should use only the clean `/meepo ...` product surface.

## How `/lab` is gated

`/lab` is protected by two layers:

1. Registration gate
- `ENABLE_LAB_COMMANDS=true` is required for `/lab` to be registered at deploy time.

2. Runtime allowlist
- `DEV_USER_IDS` (comma-separated Discord user IDs)
- `DEV_GUILD_IDS` (comma-separated Discord guild IDs; optional)

Authorization behavior:
- If a user is not allowlisted by user ID or guild ID, `/lab` returns an ephemeral denial message.

## Deployment profiles

### Local dev (PowerShell)

```powershell
$env:ENABLE_LAB_COMMANDS="true"
$env:DEV_USER_IDS="123456789012345678"
# optional
$env:DEV_GUILD_IDS="987654321098765432"
```

### Staging

- Enable `/lab`.
- Include only your user ID in `DEV_USER_IDS`.
- Optionally include a staging guild in `DEV_GUILD_IDS`.

Example:

```powershell
$env:ENABLE_LAB_COMMANDS="true"
$env:DEV_USER_IDS="123456789012345678"
# optional
$env:DEV_GUILD_IDS="987654321098765432"
```

### Production (PowerShell)

```powershell
$env:ENABLE_LAB_COMMANDS="false"
# DEV_* should be unset
```

## Troubleshooting

### `/lab` does not appear in slash autocomplete

- Confirm `ENABLE_LAB_COMMANDS=true` in the environment used for command deploy.
- Re-run command deployment (`npm run dev:deploy`) after changing env.

### `/lab` appears but returns not authorized

- Check `DEV_USER_IDS` and `DEV_GUILD_IDS` values.
- IDs are comma-separated.
- Spaces are tolerated (values are trimmed), but recommended format is no spaces.
- Verify the calling account ID is exactly present.

## Security note

- `/lab` should remain disabled in production unless explicitly intended.
- Recommended default: `ENABLE_LAB_COMMANDS=false` in prod.
- Optional hardening: add a CI/deploy check that fails if production deploy enables `/lab` unexpectedly.
