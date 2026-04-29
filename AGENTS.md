# ISOBEL — Agent / Codex Context

## What this repo is

ISOBEL is a self-hosted Discord music bot with an optional web dashboard for per-server settings.

- **Bot** (`/` root): TypeScript, discord.js, Prisma → PostgreSQL
- **Web** (`/web`): React + Vite (frontend), Express (API), Drizzle → same PostgreSQL

## Critical constraint: shared database

Both the bot and the web server must connect to the **same** Postgres database. The bot uses `DATABASE_URL` from the root `.env`; the web uses `DATABASE_URL` from `web/.env`. These must point to the same instance (ignoring `-pooler` URL variants).

## Settings flow

Settings are stored in a `setting` table. The bot reads them via Prisma every time a command runs. The web dashboard writes them via Drizzle when a user saves. For settings to actually affect bot behavior, both apps must share the same database.

## API validation rule

`web/src/lib/validation.ts` uses a Zod schema with `.strict()`. The POST body for `POST /api/guilds/:id/settings` must contain **only** these nine fields — no extras:

```
playlistLimit, secondsToWaitAfterQueueEmpties, leaveIfNoListeners,
queueAddResponseEphemeral, autoAnnounceNextSong, defaultVolume,
defaultQueuePageSize, turnDownVolumeWhenPeopleSpeak, turnDownVolumeWhenPeopleSpeakTarget
```

Do not send `guildId`, `createdAt`, or `updatedAt` in the body.

## Discord API rate limits

`web/src/server/bot-guilds.ts` caches the bot's guild list for 5 minutes. Do not reduce this TTL. Set `BOT_HEALTH_URL` in `web/.env` so the guild list is fetched from the local bot health endpoint instead of Discord's API directly.

## Schema sync requirement

The `setting` table is defined in two places:
- `schema.prisma` (bot, Prisma)
- `web/src/db/schema.ts` (web, Drizzle)

Any schema change requires updating both files and running migrations for both ORMs.

## CORS

Allowed methods: `GET, POST, DELETE, OPTIONS`. Defined in `web/src/server/app.ts`.

## Env files

| File | Used by |
|------|---------|
| `.env` (root) | Bot — `DISCORD_TOKEN`, `DATABASE_URL`, etc. |
| `web/.env` | Web server — `DISCORD_CLIENT_ID/SECRET`, `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` |

## Package manager

pnpm with workspaces. Run installs from root for the bot, from `web/` for the dashboard.

## Commands

```bash
# Bot development
pnpm dev

# Web development  
cd web && pnpm dev

# Bot DB migrations
pnpm prisma migrate dev

# Web DB migrations
cd web && pnpm drizzle-kit push   # or generate + migrate
```
