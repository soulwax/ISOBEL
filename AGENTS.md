# ISOBEL — Agent / Codex Context

This repo's architecture, commands, and conventions are documented in
[CLAUDE.md](CLAUDE.md) — read that first; it's the canonical reference and is
kept in sync with the code. This file only adds the handful of details
CLAUDE.md doesn't cover.

## Corrections to old assumptions

- There is no bare `prisma` CLI usage — every invocation goes through
  `pnpm run env:set-database-url -- prisma ...` so `DATABASE_URL` gets
  resolved. Use `pnpm prisma:migrate:dev` / `pnpm prisma:migrate:deploy`, not
  `pnpm prisma migrate dev`.
- Web dev commands run from the root via pnpm's `--filter`, not `cd web &&`:
  `pnpm web:dev` (or `pnpm --filter isobel-web run dev`), and Drizzle via
  `pnpm --filter isobel-web run db:push` / `db:generate` / `db:migrate`.

## POST /api/guilds/:id/settings — exact allowed fields

`web/src/lib/validation.ts` uses `z.object({...}).strict()`, so the body may
contain only these (all optional, all rejected if any extra key — including
`guildId`, `createdAt`, `updatedAt` — is present):

```
playlistLimit                        int 1-200
secondsToWaitAfterQueueEmpties       int 0-300
leaveIfNoListeners                   boolean
queueAddResponseEphemeral            boolean
autoAnnounceNextSong                 boolean
defaultVolume                        int 0-100
defaultQueuePageSize                 int 1-30
turnDownVolumeWhenPeopleSpeak        boolean
turnDownVolumeWhenPeopleSpeakTarget  int 0-100
maxQueueSize                         int 0-500
defaultLoopMode                      int 0-2
```

## Bot health check from the web server

`web/src/server/bot-guilds.ts` (`GET /api/bot-health`) hits the bot's health
endpoint to show it as online/offline in the dashboard. It targets
`http://127.0.0.1:<HEALTH_PORT or 3002>/health` by default; set
`BOT_HEALTH_URL` (see [web/src/server/bot-health-url.ts](web/src/server/bot-health-url.ts))
only when the bot isn't reachable at that host/port from the web process.

## CORS

Allowed methods: `GET, POST, DELETE, OPTIONS`. Defined in
[web/src/server/app.ts](web/src/server/app.ts).
