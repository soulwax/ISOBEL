# Discord Authentication (Web Interface)

This document describes how Discord-based authentication works in the ISOBEL web interface.

## Overview

- **Stack**: [Auth.js](https://authjs.dev/) core with the **Discord** OAuth2 provider.
- **Session strategy**: Database-backed sessions (PostgreSQL via Drizzle). Sessions are stored in the `session` table; the adapter also uses `user`, `account`, and `verificationToken` tables.
- **Scopes**: Discord OAuth requests `identify` and `guilds` so the app can show the user’s profile and the servers (guilds) they share with the bot.

Authentication is used to:
- Identify the user in the UI (e.g. “Login with Discord” / avatar and name).
- Protect API routes that manage **guild settings** (e.g. `/api/guilds`, `/api/guilds/:guildId/settings`). Those routes use the `requireAuth` middleware and rely on the session.

The **Discord bot** (root of the repo) uses a **bot token** (`DISCORD_TOKEN`) and is separate from this OAuth flow. The web app uses a **Discord OAuth2 Application** (client ID + client secret) only for logging users into the website.

---

## Configuration

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_CLIENT_ID` | Yes | Discord OAuth2 application **Client ID** |
| `DISCORD_CLIENT_SECRET` | Yes | Discord OAuth2 application **Client Secret** |
| `NEXTAUTH_SECRET` | Recommended | Secret for signing cookies/session. Generate with `openssl rand -base64 32`. If unset, the app falls back to `DISCORD_CLIENT_SECRET` (not ideal for production). |
| `AUTH_SECRET` | Alternative | Same role as `NEXTAUTH_SECRET` (Auth.js accepts either). |
| `NEXTAUTH_URL` | Yes in production | Full base URL of the web app (e.g. `https://your-domain.com` or `http://localhost:3001`). Used for redirects and callback URL. |

Redirect URL that must be allowed in the Discord Developer Portal:

- **Callback URL**: `{NEXTAUTH_URL}/api/auth/callback/discord`  
  Examples: `http://localhost:3001/api/auth/callback/discord`, `https://your-domain.com/api/auth/callback/discord`.

### Discord Developer Portal

1. Go to [Discord Developer Portal](https://discord.com/developers/applications).
2. Create or select an application (this is the **OAuth2 application** for the website, not the bot).
3. **OAuth2 → General**:
   - Add the **Redirect** URL: `{NEXTAUTH_URL}/api/auth/callback/discord`.
4. Under **OAuth2 → Scopes**, the app uses:
   - `identify` — user id, username, avatar, etc.
   - `guilds` — list of servers the user is in (to show “your servers” and manage guild settings).
5. Copy **Client ID** → `DISCORD_CLIENT_ID`, **Client Secret** → `DISCORD_CLIENT_SECRET`.

---

## Auth flow (step-by-step)

1. **User clicks “Login with Discord”**  
   The UI uses the client helper `signIn()` from `web/src/lib/auth-client.ts`.

2. **Client gets a CSRF token**  
   `getCsrfToken()` fetches `GET /api/auth/csrf` (credentials included). Auth.js returns a token used to prevent CSRF on sign-in.

3. **Client starts Discord OAuth**  
   The client submits a **form POST** to `/api/auth/signin/discord` with:
   - `csrfToken`
   - `callbackUrl` (current page URL so the user is sent back after login).  
   This is a full-page form POST so the browser can follow redirects (OAuth requires redirects).

4. **Auth.js redirects to Discord**  
   The server responds with a redirect to Discord’s authorization URL (with `client_id`, `scope=identify guilds`, `redirect_uri`, state, etc.). The user authorizes the app on Discord.

5. **Discord redirects back to the app**  
   Discord sends the user to `{NEXTAUTH_URL}/api/auth/callback/discord?code=...&state=...`.

6. **Auth.js callback**  
   The route bridge in `web/src/server/app.ts` delegates all `GET`/`POST` under `/api/auth/*` to Auth.js handlers. On the callback request, Auth.js:
   - Exchanges the `code` for tokens with Discord.
   - Runs the **signIn** callback (see below).
   - Creates or updates the **user** and **account** in the DB (via Drizzle adapter).
   - Creates a **session** in the DB and sets the session cookie.
   - Redirects the browser to `callbackUrl`.

7. **After redirect**  
   The app loads again; the client calls `GET /api/auth/session` (e.g. from `useAuth()` / `getSession()`). The session cookie is sent; Auth.js reads the DB session and returns the session payload (user id, name, image, and custom fields like `discordId`). The UI then shows the user as logged in and can call protected APIs.

---

## Server-side: where auth runs

- **Auth API base path**: `/api/auth`.  
  All Auth.js routes are under this prefix (e.g. `/api/auth/session`, `/api/auth/signin/discord`, `/api/auth/callback/discord`, `/api/auth/csrf`, `/api/auth/signout`).

- **How the request reaches Auth.js**  
  In `web/src/server/app.ts`, any request matching `^/api/auth/.*` is:
  1. Rate-limited by `authLimiter` (session/csrf/providers paths are skipped from the limit).
  2. Turned into a Web `Request` with the correct full URL (using `x-forwarded-proto` / `x-forwarded-host` when present).
  3. Passed to Auth.js handlers (GET or POST). The response (including redirects and `Set-Cookie`) is translated back to Express and sent.

The **same Express app** serves `/api/guilds`, `/api/auth/*`, and the rest of the API. In production (Docker, PM2, or Vercel) a single web process serves both the frontend and the API (including auth). For **local development**, you can run `pnpm dev:all`: Vite (port 3001) serves the frontend and proxies `/api` to the API server (port 3003) so auth and API routes work without a separate deployment.

---

## Auth.js config (what runs on sign-in and for the session)

- **Config file**: `web/src/auth/config.ts`.  
- **Entry**: `web/src/auth/index.ts` exports request handlers that call `Auth(request, authConfig)`.

Important details:

- **Adapter**: `DrizzleAdapter(db)` — users, accounts, sessions, verification tokens are stored in PostgreSQL.
- **Provider**: `Discord` with `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`, and `scope: 'identify guilds'`.
- **basePath**: `'/api/auth'`; **url**: from `NEXTAUTH_URL` when set.
- **session.strategy**: `'database'` (session stored in DB, not JWT).
- **secret**: `NEXTAUTH_SECRET` or `AUTH_SECRET` or (fallback) `DISCORD_CLIENT_SECRET`.

**signIn callback** (runs after Discord returns the user and tokens):

- Saves or updates the Discord user in `discordUsers` (id, userId, username, avatar, etc.).
- Uses the Discord `access_token` to call `GET https://discord.com/api/v10/users/@me/guilds`.
- In a transaction, upserts guilds into `discordGuilds` and membership into `guildMembers`.  
  This keeps “which user is in which guild” in sync for permission checks (e.g. “can this user manage this guild’s settings?”).  
  If this fails, the error is logged but sign-in still succeeds (`return true`).

**session callback**:

- Attaches `user.id` (internal DB user id) and `user.discordId` (Discord snowflake from `discordUsers`) to the session so the API and UI can use both.

---

## Client-side: how the UI signs in and uses the session

- **Auth client**: `web/src/lib/auth-client.ts`.  
  - `signIn()` — gets CSRF token, then form-POSTs to `/api/auth/signin/discord` with `callbackUrl`.  
  - `signOut()` — CSRF then POST to `/api/auth/signout` (or redirect to signout URL).  
  - `getSession()` — `GET /api/auth/session` with credentials; returns the session object or null.

- **Base URL for auth**: `AUTH_BASE_URL` in `web/src/lib/api-paths.ts` is `{API_BASE_URL}/auth`.  
  - In production, `API_BASE_URL` is from `VITE_AUTH_API_URL` (if set) or `/api`.  
  - So the browser calls `/api/auth/session`, `/api/auth/signin/discord`, etc. (or the same path on a different host if you use a proxy).

- **React**: `web/src/hooks/useAuth.ts` uses `getSession`, `signIn`, `signOut` and exposes `session`, `loading`, `signIn`, `signOut`, `isAuthenticated`. Session is refreshed on window focus (e.g. after OAuth redirect). The “Login with Discord” button and the header user menu use this hook (e.g. `web/src/components/DiscordLogin.tsx`).

---

## Protecting API routes

- **Middleware**: `web/src/server/middleware.ts` defines `requireAuth`.  
  It builds a GET request to `{origin}/api/auth/session`, forwards the incoming request’s cookies, calls the Auth.js GET handler, and parses the JSON response. If the result has `session.user.id`, the session is attached to the Express request and the handler runs; otherwise the middleware returns 401.

- **Usage**: In `app.ts`, routes that need a logged-in user use `requireAuth`:
  - `GET /api/guilds` — list guilds the user can manage.
  - `GET /api/guilds/:guildId/settings` — get guild settings.
  - `POST /api/guilds/:guildId/settings` — update guild settings.  
  These also check that the user has permission to manage the guild (e.g. via `canManageGuildSettings` using `guildMembers` / permissions).

---

## Database tables involved

- **Auth.js adapter tables**  
  - `user` — internal user id, name, email, image.  
  - `account` — links user to Discord (provider, providerAccountId, access_token, refresh_token, etc.).  
  - `session` — sessionToken, userId, expires.  
  - `verificationToken` — used by Auth.js for email verification etc.; not heavily used in this app.

- **App-specific**  
  - `discord_user` — Discord user id, link to `user.id`, username, avatar, etc.  
  - `discord_guild` — guild id, name, icon, permissions, etc.  
  - `guild_member` — which Discord user is in which guild; used for permission checks when changing guild settings.

---

## Vercel deployment

When the web app is hosted on **Vercel**, authentication works with the same Auth.js flow; only configuration and routing differ.

### How it runs on Vercel

- **Single serverless function**: `vercel.json` rewrites both `/api/auth/(.*)` and `/api/(.*)` to the same handler, `api/index.ts`.
- **Same Express app**: That handler imports `createApp()` from `src/server/app.ts` and passes the Vercel request/response into the Express app. So the same routes (including all Auth.js routes under `/api/auth`) are served by one serverless invocation per request.
- **URL and cookies**: The app sets `trust proxy` when `VERCEL=1`, and builds the request URL for Auth.js from `x-forwarded-proto`, `x-forwarded-host`, and `req.originalUrl`. Vercel sets these headers, so the callback URL and redirects use the correct public URL. The frontend and API are the same origin (e.g. `https://your-app.vercel.app`), so session cookies work without extra CORS or cookie domain config.

### What you must set on Vercel

1. **Environment variables** (in Vercel project → Settings → Environment Variables):
   - `DISCORD_CLIENT_ID` — Discord OAuth2 application Client ID
   - `DISCORD_CLIENT_SECRET` — Discord OAuth2 application Client Secret
   - `NEXTAUTH_SECRET` — e.g. `openssl rand -base64 32` (do not rely on `DISCORD_CLIENT_SECRET` fallback in production)
   - `NEXTAUTH_URL` — **must be your Vercel app URL**, e.g. `https://your-project.vercel.app` (or your custom domain, e.g. `https://isobel.example.com`)
   - `DATABASE_URL` (or Vercel Postgres `POSTGRES_URL`) — same PostgreSQL as used for the rest of the app; Auth.js stores sessions and users there.

2. **Discord Developer Portal**  
   Add a redirect URL that matches `NEXTAUTH_URL`:
   - `https://your-project.vercel.app/api/auth/callback/discord`  
   (or your custom domain). Discord will only redirect back to URLs listed there.

3. **Database**  
   Run your migrations (e.g. `pnpm db:push` from `web/`) so the `user`, `account`, `session`, and `verificationToken` tables exist in the DB Vercel uses (same `DATABASE_URL` / `POSTGRES_URL`).

### Checklist

- [ ] `NEXTAUTH_URL` = exact URL users see (no trailing slash): e.g. `https://your-app.vercel.app`
- [ ] Discord OAuth2 redirect URL = `{NEXTAUTH_URL}/api/auth/callback/discord`
- [ ] `NEXTAUTH_SECRET` set to a random value (not shared with Discord client secret)
- [ ] PostgreSQL reachable from Vercel (e.g. Vercel Postgres, Neon, Supabase) and migrations applied

If login fails, typical causes are: `NEXTAUTH_URL` wrong or missing, Discord redirect URL not matching, or DB not reachable / tables missing.

### Troubleshooting: redirect to signin + "Service unavailable"

If you end up at `https://your-domain/api/auth/signin?callbackUrl=...` and the response is `{"error":"Internal server error","message":"Service unavailable"}` (or another message after the change below):

1. **Redeploy** so the latest API code is live (the handler now returns the real error message on Vercel).
2. **Check the response body** after redeploy — it will show the underlying error (e.g. missing env var or DB error).
   - If you see `Cannot find module .../next/server imported from .../next-auth/...`, the deployment is still using `next-auth`. This project now uses `@auth/core`; redeploy with the updated `web/package.json` and `web/src/auth/index.ts`.
3. **Environment variables**: In Vercel → Project → Settings → Environment Variables, ensure **Production** (and Preview if you test there) has:
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` = `https://isobelnet.de` (no trailing slash)
   - `DATABASE_URL` or `POSTGRES_URL` (PostgreSQL connection string)
4. **Redeploy again** after changing env vars (or trigger a new deployment so the function uses the new values).
5. **Vercel function logs**: In the Vercel dashboard, open the deployment → Functions → select the API function and check **Logs** for the full error and stack trace.

---

## Development (two processes)

Run `pnpm dev:all` in the web directory: Vite runs on port 3001 and the API server on port 3003. Vite proxies `/api` to `http://localhost:3003` (override with `API_PROXY_TARGET`). Same auth flow; the browser talks to the same origin (3001) and the proxy forwards API and auth requests to the API server.

---

## Summary

- **Discord OAuth** is used only for the **web UI**: users log in with Discord; the app stores them in `user` + `account` and keeps Discord profile and guild list in `discordUsers` / `discordGuilds` / `guildMembers`.
- **Auth.js core** with **Drizzle adapter** and **database sessions** handles the OAuth flow, callbacks, and session management under `/api/auth`.
- **Protected routes** use `requireAuth`, which resolves the session via `GET /api/auth/session` and the same Auth.js handlers.  
- **Redirect URL** must be exactly `{NEXTAUTH_URL}/api/auth/callback/discord` in the Discord application’s OAuth2 settings, and `NEXTAUTH_URL` must match the URL the user sees in the browser.
