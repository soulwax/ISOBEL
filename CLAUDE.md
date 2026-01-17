# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ISOBEL is a self-hosted Discord music bot that streams music from the Starchild Music API. It's built for small to medium Discord servers and emphasizes high-quality audio (320kbps MP3 source with 192kbps Opus output), local caching, and predictable queue management.

## Core Technologies

- **Runtime**: Node.js 20+ (latest 20.x.x LTS recommended)
- **Language**: TypeScript with ES modules (`type: "module"`)
- **Discord**: Discord.js v14 with @discordjs/voice for audio streaming
- **Database**: Prisma with SQLite for persistence
- **Dependency Injection**: Inversify with decorators (`experimentalDecorators: true`)
- **Audio Processing**: fluent-ffmpeg (requires ffmpeg 4.1+ system dependency)
- **Process Management**: PM2 for production deployments

## Development Commands

### Essential Commands
```bash
# Development mode (with hot reload)
npm run dev               # Bot only
npm run dev:all           # Both bot and web (recommended for full-stack development)
npm run debug             # Kill PM2 process and start fresh dev mode

# Build TypeScript
npm run build             # Build both bot and web, then start with PM2
npm run build:bot         # Build only the bot
npm run build:all         # Build both without starting services

# Start production (runs migrations then starts)
npm start                 # Start bot only (runs migrations first)
npm run start:all:prod    # Start both bot and web with PM2 (production)
npm run start:all:dev     # Start both bot and web with PM2 (development)

# Linting and type checking
npm run lint              # Lint bot code
npm run lint:all          # Lint both bot and web
npm run lint:fix          # Auto-fix bot linting issues
npm run lint:fix:all      # Auto-fix linting issues in both projects
npm run typecheck         # Type check bot code
npm run typecheck:all     # Type check both bot and web
npm test                  # Runs lint (used by pre-commit hook)

# Cache management
npm run cache:clear-key-value  # Clear the key-value cache
```

### Database Migrations
```bash
# Generate new migration (interactive, creates migration files)
npm run migrations:generate

# Run pending migrations (used in production/Docker)
npm run migrations:run

# Direct Prisma commands (with DATABASE_URL set automatically)
npm run prisma:with-env migrate dev
npm run prisma:with-env migrate deploy
npm run prisma:generate
```

### Web Interface (Git Submodule at ./web)
```bash
# Submodule management
npm run submodule:init      # Initialize submodules (runs in postinstall)
npm run submodule:update    # Update to latest remote commits
npm run submodule:status    # Check status

# Web development
npm run web:dev             # Start web dev server
npm run web:build           # Build web for production
npm run web:lint            # Lint web code
```

### PM2 Process Management
```bash
# Bot process management
npm run pm2:start           # Start with production env (default)
npm run pm2:start:prod      # Start with production env
npm run pm2:start:staging   # Start with staging env
npm run pm2:start:dev       # Start with development env
npm run pm2:restart         # Restart bot
npm run pm2:restart:prod    # Restart with production env
npm run pm2:stop            # Stop bot
npm run pm2:delete          # Delete bot process from PM2
npm run pm2:logs            # View logs (all)
npm run pm2:logs:error      # View error logs only
npm run pm2:logs:out        # View output logs only
npm run pm2:status          # Show PM2 status
npm run pm2:info            # Describe bot process
npm run pm2:monit           # Interactive monitoring

# Combined bot + web management
npm run start:all:prod      # Start both bot and web in production
npm run start:all:dev       # Start both bot and web in development
npm run stop:all            # Stop both
npm run restart:all         # Restart both
npm run logs:all            # View all logs (both bot and web)

# PM2 system management
npm run pm2:save            # Save current process list
npm run pm2:resurrect       # Restore saved process list
npm run pm2:startup         # Configure PM2 to start on system boot
npm run pm2:reset           # Delete all processes and kill PM2 daemon
```

## Architecture

### Directory Structure

```
src/
├── bot.ts                  # Main Bot class (handles Discord client, events, commands)
├── index.ts                # Entry point
├── inversify.config.ts     # Dependency injection container configuration
├── types.ts                # DI type symbols
├── commands/               # Discord slash commands (each exports a Command class)
│   ├── index.ts           # Base Command interface
│   ├── play.ts            # Main play command
│   ├── queue.ts           # Queue management
│   ├── skip.ts, pause.ts, etc.
│   └── config.ts          # Guild settings configuration
├── services/               # Business logic layer
│   ├── player.ts          # Core Player class (manages audio playback per guild)
│   ├── starchild-api.ts   # Starchild Music API client
│   ├── get-songs.ts       # Song fetching and URL parsing
│   ├── add-query-to-queue.ts  # Queue manipulation logic
│   ├── file-cache.ts      # Local MP3 cache management (Prisma)
│   ├── key-value-cache.ts # Generic KV cache (Prisma)
│   ├── config.ts          # Environment configuration provider
│   └── health-server.ts   # HTTP health check endpoint
├── managers/
│   └── player.ts          # PlayerManager (manages Player instances per guild)
├── events/
│   ├── guild-create.ts    # Guild join handler (registers commands, sends DM)
│   └── voice-state-update.ts  # Voice channel state changes
├── utils/                 # Helper functions
└── scripts/               # Executable scripts
    ├── start.ts           # Main start script
    ├── migrate-and-start.ts  # Production start (migrations + start)
    └── run-with-database-url.ts  # Sets DATABASE_URL for Prisma commands
```

### Dependency Injection (Inversify)

All services, managers, and commands are registered in `src/inversify.config.ts` and injected via constructor parameters:

- **Singleton scope**: Bot, Client, Config, Services, Managers
- **Transient scope**: Commands (bound as `TYPES.Command`)
- Use `@inject(TYPES.SomeService)` decorator for constructor injection
- `container.get<Type>(TYPES.Something)` for manual resolution

### Player Architecture

- **PlayerManager** (`managers/player.ts`): Factory that creates and tracks one Player instance per guild
- **Player** (`services/player.ts`): Stateful audio player for a guild
  - Manages voice connection, audio player, queue, playback state
  - Handles file caching, volume control, loop modes
  - Updates "Now Playing" embeds with animated progress bars
  - Supports both Starchild API streams and HLS live streams

### Database Schema (Prisma + SQLite)

Located in `schema.prisma` at project root:

- **FileCache**: Stores cached MP3 files
  - `hash` (PK): SHA-256 hash of the source URL
  - `bytes`: File size for cache eviction logic
  - `accessedAt`: LRU tracking for cache cleanup

- **KeyValueCache**: Generic cache with expiration
  - `key` (PK): Cache key
  - `value`: JSON-serialized data
  - `expiresAt`: Automatic expiration timestamp

- **Setting**: Per-guild configuration
  - `guildId` (PK): Discord guild ID
  - `defaultVolume`: Initial volume (0-100, default: 100)
  - `playlistLimit`: Max songs from playlist (default: 50)
  - `secondsToWaitAfterQueueEmpties`: Disconnect delay (default: 30)
  - `leaveIfNoListeners`: Auto-disconnect when alone (default: true)
  - `autoAnnounceNextSong`: Announce next track (default: false)
  - `turnDownVolumeWhenPeopleSpeak`: Auto-ducking (default: false)
  - `turnDownVolumeWhenPeopleSpeakTarget`: Target volume % (default: 20)

- **FavoriteQuery**: User-saved shortcuts for play commands
  - `name` + `guildId` unique constraint
  - Allows custom aliases like `/play favorite:packers`

Database file location: `${DATA_DIR}/database.sqlite` (defaults to `./data/database.sqlite`)

### Commands Pattern

Each command in `src/commands/` extends the base `Command` interface:
- Exports a class decorated with `@injectable()`
- Implements `slashCommand()` method returning Discord.js `SlashCommandBuilder`
- Implements `execute(interaction)` and optionally `handleAutocomplete(interaction)`
- Registered automatically in `inversify.config.ts`

### Environment Configuration

Required variables (set in `.env` or via Docker):
- `DISCORD_TOKEN`: Bot token from Discord Developer Portal
- `STARCHILD_BASE_URL`: Starchild Music API base URL
- `STARCHILD_API_KEY`: API key for Starchild Music API

Optional variables:
- `DATA_DIR`: Data directory (default: `./data`)
- `CACHE_LIMIT`: Cache size limit (default: `2GB`, examples: `512MB`, `10GB`)
- `ENV_FILE`: Path to environment file for Docker (default: `/config`)
- `BOT_STATUS`: `online`, `idle`, `dnd` (default: `online`)
- `BOT_ACTIVITY_TYPE`: `PLAYING`, `LISTENING`, `WATCHING`, `STREAMING`
- `BOT_ACTIVITY`: Activity text
- `BOT_ACTIVITY_URL`: Required for `STREAMING` activity type (Twitch or YouTube URL)
- `ENABLE_SPONSORBLOCK`: Enable SponsorBlock integration (default: `false`)
- `SPONSORBLOCK_TIMEOUT`: Retry delay in minutes when SponsorBlock is unreachable (default: `5`)
- `REGISTER_COMMANDS_ON_BOT`: Register commands globally vs per-guild

## Key Implementation Patterns

### Starchild API Authentication

**CRITICAL**: The Starchild Music API requires the API key to be passed as a **query parameter**, not just in headers:

- **Correct**: `https://api.example.com/music/stream?id=123&kbps=320&key=your-api-key`
- **Incorrect**: Using only `X-API-Key` header without query parameter

The `StarchildAPI` service (`services/starchild-api.ts`) handles this by:
- `getStreamUrl()`: Constructs URLs with `key=` query parameter
- `search()`: Includes API key in search params
- `getStream()`: Uses the URL from `getStreamUrl()` which already includes the key

### Audio Playback Flow

1. User runs `/play <query>` command
2. `GetSongs` service fetches song metadata from Starchild API
3. `AddQueryToQueue` service adds song(s) to Player's queue
4. `Player.play()` starts playback:
   - Joins voice channel if needed
   - Downloads MP3 to FileCache (or uses cached version)
   - Creates audio resource with ffmpeg filters (volume, seeking)
   - Streams to Discord voice connection
   - Updates "Now Playing" embed with animated progress bar

### Caching Strategy

- MP3 files cached locally in `${DATA_DIR}/file-cache/`
- Hashed by URL (using `hasha` library)
- LRU eviction when cache exceeds `CACHE_LIMIT`
- Managed via Prisma `FileCache` model

### Queue Management Philosophy

- One song per `/play` command (no auto-playlist expansion)
- Loop modes: single song (`/loop`) or entire queue (`/loop-queue`)
- Skip only works when queue has more songs (prevents errors at end)
- Favorites system allows shortcuts (e.g., `/play favorite:packers`)
- No vote-to-skip: "This is anarchy, not a democracy"

### Automatic Volume Management

ISOBEL can automatically adjust volume when people speak in the voice channel:

- `/config set-reduce-vol-when-voice true/false`: Enable/disable auto volume reduction
- `/config set-reduce-vol-when-voice-target <volume>`: Set target volume % when people speak (0-100, default: 20)
- Implemented in `Player` class using Discord voice state updates
- Normalizes volume across tracks for consistent listening experience

## Docker Deployment

Multi-stage Dockerfile:
1. **base**: Node 20 + ffmpeg + tini
2. **dependencies**: npm install (prod + dev)
3. **builder**: TypeScript build + Prisma generation
4. **runner**: Minimal production image with only runtime dependencies

Key runtime details:
- Uses `tini` as PID 1 for proper signal handling
- Runs `npm run migrations:run` before starting (via `migrate-and-start.ts`)
- Data volume should be mounted at `/data`
- Health check available via `HealthServer` service

## Web Interface

Separate git submodule at `./web`:
- Independent React-based frontend for guild settings and management
- Automatically initialized during `npm install` (postinstall hook)
- Uses separate PM2 processes for auth and web servers
- Managed via `npm run web:*` commands

Development workflow:
- `npm run dev:all`: Run both bot and web in development mode (recommended)
- `npm run web:dev`: Web dev server only (Vite)
- `npm run web:dev:all`: Web dev server + auth server
- `npm run web:pm2:logs:web`: View web server logs
- `npm run web:pm2:logs:auth`: View auth server logs

If web submodule is missing: `npm run submodule:init` or `git submodule update --init --recursive`

## Versioning and Deployment Strategy

- **`master` branch**: Bleeding edge / development - **not guaranteed to be stable**
- **Production**: Use [tagged releases](https://github.com/soulwax/ISOBEL/releases/) for stability
- **Version tags**: `:latest`, `:2`, `:2.12`, `:2.12.2` (Docker)
- When deploying production instances, always checkout a tagged release: `git checkout v[version]`

## Important Notes

- **ES Modules**: Project uses `"type": "module"` - all imports need `.js` extension even for `.ts` files
- **Decorators**: `experimentalDecorators: true` required for Inversify
- **ffmpeg**: Must be installed on system (not npm package)
- **64-bit OS required**: Due to Discord voice dependencies
- **Submodules**: Always clone with `--recursive` flag or run `npm run submodule:init`
- **Database URL**: Auto-generated as `file:${DATA_DIR}/database.sqlite`, managed by `run-with-database-url.ts`

## Testing & Quality

- No automated test suite currently (uses lint as smoke test)
- Pre-commit hook runs `npm test` (which runs `npm run lint`)
- Use `npm run typecheck:all` before commits to catch type errors
- Consider running `npm run build:all` to verify full build succeeds

## Troubleshooting

- **401 Unauthorized from Starchild API**: Ensure `STARCHILD_API_KEY` is set correctly. The API key must be passed as a query parameter (`key=`), which is handled automatically by the `StarchildAPI` service. If you see this error, check that `getStreamUrl()` in `services/starchild-api.ts` includes the API key in the URL params.
- **ffmpeg not found**: Install system package (`apt-get install ffmpeg` on Debian/Ubuntu)
- **Voice connection issues**: Check bot has Connect + Speak permissions (BOT_REQUIRED_PERMISSIONS = 36700160)
- **Database locked**: SQLite issue - ensure only one bot instance per database file
- **Submodule not found**: Run `npm run submodule:init` or `git submodule update --init --recursive`
- **Build errors after git pull**: Run `npm run prisma:generate` to regenerate Prisma client
- **PM2 process conflicts**: Use `npm run pm2:reset` to clear all processes and start fresh
