# Start Here (v1.1)

This is the only guide needed for first-time setup.

## 1) Invite and Configure

- Invite the bot to your Discord server.
- Enable Message Content intent in the Discord developer portal.
- Set environment variables:
  - `DISCORD_TOKEN`
  - `OPENAI_API_KEY`

## 2) Deploy Commands

```bash
npm run dev:deploy
```

## 3) Start the Bot

```bash
npm run dev:bot
```

## 4) Wake Meepo

In your preferred text channel:

```text
/meepo wake
```

On first wake, Meepo auto-runs guild setup:
- binds home text channel,
- binds home voice if you are currently in voice,
- initializes canon mode + default recap style.

## 5) Talk to Meepo

- Text: `meepo: hello`
- Voice: join voice and use `/meepo talk` if TTS is configured.

## 6) Generate a Session Recap

```text
/meepo sessions recap session:<id>
```

(Style defaults to guild setting; default fallback is `balanced`.)

## 7) View Session Hub

```text
/meepo sessions view session:<id>
```

This shows base/final recap status, metadata, and available artifacts.
