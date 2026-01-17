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
npm run dev

# Build TypeScript
npm run build

# Start production (runs migrations then starts)
npm start

# Linting and type checking
npm run lint              # Lint bot code
npm run lint:all          # Lint both bot and web
npm run typecheck         # Type check bot code
npm run typecheck:all     # Type check both bot and web
npm test                  # Runs lint (used by pre-commit hook)
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
npm run pm2:start           # Start with default env
npm run pm2:start:prod      # Start with production env
npm run pm2:restart         # Restart bot
npm run pm2:logs            # View logs
npm run pm2:stop            # Stop bot

# Combined bot + web management
npm run start:all:prod      # Start both bot and web in production
npm run stop:all            # Stop both
npm run logs:all            # View all logs
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

- **FileCache**: Stores cached MP3 files (hash-based, size tracking)
- **KeyValueCache**: Generic cache with expiration
- **Setting**: Per-guild configuration (volume, queue settings, auto-announce, etc.)
- **FavoriteQuery**: User-saved shortcuts for play commands

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
- `BOT_STATUS`: `online`, `idle`, `dnd` (default: `online`)
- `BOT_ACTIVITY_TYPE`: `PLAYING`, `LISTENING`, `WATCHING`, `STREAMING`
- `BOT_ACTIVITY`: Activity text
- `ENABLE_SPONSORBLOCK`: Enable SponsorBlock integration (default: `false`)
- `REGISTER_COMMANDS_ON_BOT`: Register commands globally vs per-guild

## Key Implementation Patterns

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
- Independent React-based frontend
- Automatically initialized during `npm install` (postinstall hook)
- Uses separate PM2 processes for auth and web servers
- Managed via `npm run web:*` commands

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

- **ffmpeg not found**: Install system package (`apt-get install ffmpeg` on Debian/Ubuntu)
- **Voice connection issues**: Check bot has Connect + Speak permissions (BOT_REQUIRED_PERMISSIONS = 36700160)
- **Database locked**: SQLite issue - ensure only one bot instance per database file
- **Submodule not found**: Run `npm run submodule:init` or `git submodule update --init --recursive`
