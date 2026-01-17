# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ISOBEL is a web interface for the ISOBEL Discord music bot. It uses Discord OAuth for authentication and provides a dashboard for managing bot settings across Discord guilds (servers).

## Common Commands

### Development
```bash
# Install dependencies
npm install

# Start Vite dev server only (port 3001)
npm run dev

# Start auth server only (port 3003)
npm run dev:auth

# Start both servers concurrently (recommended for development)
npm run dev:all

# Lint code
npm run lint
```

### Database
```bash
# Generate migration files from schema changes
npm run db:generate

# Apply migrations to database
npm run db:migrate

# Push schema directly to database (dev only)
npm run db:push

# Open Drizzle Studio to view database
npm run db:studio
```

### Build & Preview
```bash
# Build for production (outputs to ./build directory)
npm run build

# Preview production build locally
npm run preview
```

### PM2 Process Management
```bash
# Start both web and auth servers (development mode)
npm run pm2:start:dev

# Start both servers (production mode)
npm run pm2:start:prod

# Restart with environment updates
npm run pm2:restart

# View logs (all processes)
npm run pm2:logs

# View web server logs only
npm run pm2:logs:web

# View auth server logs only
npm run pm2:logs:auth

# Stop all processes
npm run pm2:stop

# Delete all processes
npm run pm2:delete
```

## Architecture Overview

### Dual-Server Architecture

The application runs two separate servers that work in tandem:

1. **Vite Dev Server / Web Server** (port 3001)
   - Serves the React frontend
   - In development: Vite dev server with HMR
   - In production: Serves static build from `./build` directory
   - Proxies `/api/*` requests to the auth server

2. **Auth Server** (port 3003)
   - Express server handling authentication and API endpoints
   - Runs NextAuth v5 for Discord OAuth
   - Provides REST API for guilds and settings
   - Source: [src/server/index.ts](src/server/index.ts) and [src/server/app.ts](src/server/app.ts)

### Request Flow

```
Browser → Vite Server (3001) → /api/* proxied → Auth Server (3003)
                              ↓
                         Static assets served directly
```

The Vite config ([vite.config.ts](vite.config.ts)) proxies all `/api/*` requests to the auth server at `http://localhost:3003` (or `VITE_AUTH_API_URL`).

### Database Architecture

Uses PostgreSQL with Drizzle ORM. Schema is defined in [src/db/schema.ts](src/db/schema.ts).

**Key Tables:**
- `user`, `account`, `session`, `verificationToken` - NextAuth tables
- `discord_user` - Discord profile data, links to NextAuth `user` table
- `discord_guild` - Discord server (guild) information
- `guild_member` - Join table for users in guilds with permissions
- `setting` - Bot configuration per guild (playlist limits, volume, etc.)

**Important Relationships:**
- Users can belong to multiple guilds via `guild_member`
- Guild settings require `MANAGE_GUILD` permission (0x00000020 bit flag)
- Discord user data is synced during sign-in callback ([src/auth/config.ts:36-140](src/auth/config.ts#L36-L140))

### Authentication Flow

1. NextAuth v5 handles Discord OAuth
2. On sign-in, the callback ([src/auth/config.ts:37](src/auth/config.ts#L37)):
   - Saves Discord user profile to `discord_user` table
   - Fetches user's guilds from Discord API
   - Batch inserts/updates guilds and memberships in transaction
3. Session includes both NextAuth user ID and Discord user ID
4. API endpoints verify guild membership before allowing access

### Deployment Models

#### PM2 (Self-Hosted)
- Two processes: `isobel-web` and `isobel-auth`
- Configuration: [ecosystem.config.cjs](ecosystem.config.cjs)
- Logs stored in `./logs` directory
- Web process runs Vite dev server (dev) or preview (prod)
- Auth process runs Express server via `npm run dev:auth`

#### Vercel (Serverless)
- Frontend: Static build deployed from `./build`
- Backend: Single serverless function at [api/index.ts](api/index.ts)
- Configuration: [vercel.json](vercel.json)
- All `/api/*` routes handled by serverless function
- See [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) for details

## Environment Variables

Required variables (see [.env.example](.env.example)):
- `DATABASE_URL` or `POSTGRES_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - Generate with `openssl rand -base64 32`
- `NEXTAUTH_URL` - Frontend URL (e.g., `http://localhost:3001`)
- `DISCORD_CLIENT_ID` - From Discord Developer Portal
- `DISCORD_CLIENT_SECRET` - From Discord Developer Portal

Optional:
- `PORT` - Web server port (default: 3001)
- `VITE_AUTH_API_URL` - Auth server URL (default: `http://localhost:3003`)
- `BOT_HEALTH_URL` - Bot health check endpoint (default: `https://isobelhealth.soulwax.dev`)

## Key Patterns

### Permission Checking
- Discord permissions are bitwise flags stored as strings
- Helper function `canManageGuildSettings()` in [src/lib/utils.ts](src/lib/utils.ts) checks for `MANAGE_GUILD` permission
- Used in settings update endpoint ([src/server/app.ts:376](src/server/app.ts#L376))

### Error Handling
- Custom error classes in [src/lib/errors.ts](src/lib/errors.ts): `AuthorizationError`, `NotFoundError`
- Error handler middleware in [src/server/middleware.ts](src/server/middleware.ts)
- All API errors logged via Winston logger ([src/lib/logger.ts](src/lib/logger.ts))

### CORS Configuration
- Development: Allows all `localhost` origins on any port
- Production: Strict origin checking against `NEXTAUTH_URL`
- Implementation in [src/server/app.ts:79-134](src/server/app.ts#L79-L134)

### Rate Limiting
- API endpoints: 100 requests per 15 minutes per IP
- Auth endpoints: 5 requests per 15 minutes per IP
- Uses `express-rate-limit` with in-memory store

### Database Transactions
- Guild sync uses transactions for atomicity ([src/auth/config.ts:80-132](src/auth/config.ts#L80-L132))
- Batch upserts with `onConflictDoUpdate` for efficiency
- Connection pooling configured for serverless compatibility

## File Structure Notes

- `src/` - React app source code
  - `components/` - React components
  - `hooks/` - React hooks (e.g., `useAuth.ts`)
  - `lib/` - Shared utilities (env, logger, validation, errors)
  - `auth/` - NextAuth configuration
  - `db/` - Database schema and client
  - `server/` - Express auth server
- `api/` - Vercel serverless functions
- `build/` - Production build output (gitignored)
- `scripts/` - Build and migration scripts
- `drizzle/` - Database migration files

## Common Tasks

### Adding a New API Endpoint
1. Add route handler in [src/server/app.ts](src/server/app.ts)
2. Use `requireAuth` middleware for authenticated routes
3. Validate request body with Zod schemas from [src/lib/validation.ts](src/lib/validation.ts)
4. Check permissions if modifying guild data
5. Handle errors with try/catch and custom error classes

### Modifying Database Schema
1. Update schema in [src/db/schema.ts](src/db/schema.ts)
2. Generate migration: `npm run db:generate`
3. Review generated SQL in `drizzle/` directory
4. Apply migration: `npm run db:migrate`
5. Update TypeScript types (Drizzle infers automatically)

### Updating Discord OAuth Scopes
1. Modify scopes in [src/auth/config.ts:31](src/auth/config.ts#L31)
2. Update Discord app redirect URIs in Discord Developer Portal
3. Update `DISCORD_GENERATED_URL` in `.env` if used
4. Users must re-authenticate to get new scopes
