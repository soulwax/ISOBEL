# ISOBEL

<div align="center">
  <img src=".github/songbird.png" width="600" alt="ISOBEL - A Discord Music Bot">
  <br><br>
  <i>My name Isobel</i><br>
  <i>Married to myself</i><br>
  <i>My love Isobel</i><br>
  <i>Living by herself</i><br>
  <br>
  <i>In a heart full of dust</i><br>
  <i>Lives a creature called lust</i><br>
  <i>It surprises and scares</i><br>
  <i>Like me, like me</i><br>
  <br>
  <i>My name Isobel</i><br>
  <i>Married to myself</i><br>
  <i>My love Isobel</i><br>
  <i>Living by herself</i>
  <br><br>
</div>

ISOBEL is a **highly-opinionated midwestern, now German claimed (same thing really), self-hosted** Discord music bot **that doesn't suck**. It's made for small to medium-sized Discord servers/guilds (think about a group the size of you, your friends, and your friend's friends).

The original author of the bot is [codetheweb](https://github.com/codetheweb) with the original code for [muse found here](https://github.com/museofficial/muse) and *I cannot thank him enough for the inspiration and foundation he laid.*

Thus I claim the same: This discord bot is one that doesn't suck.

There are a lot of changes made since Max Isom's original version.
First of all, this bot does not depend on YouTube or Spotify for music streaming. Instead, it uses its own music api, we just call it the *ominous music* **Songbird API**. (Formerly starchild music api that's why you might find references in code or docs)

Yes, it is more of a black box experience now than before, but with spotify and youtube being so unreliable for music streaming, this was the only way to go. Sorry Max.
The second big change is that this bot is coming with its own web interface for configuration and settings management but this is work in progress. See [./web/README.md](./web/README.md).

**OTHERWISE**, ISOBEL works like before, you /play songs, /file uploads, /skip, /pause, /resume, /seek, etc.

## Features

- 🎵 **High-Quality Audio**: 320kbps MP3 source with 192kbps Opus output for crystal-clear sound
- ⏹️ **Animated Progress Bar**: Real-time updating progress bars in Discord embeds
- 🎥 **Livestream Support**: Stream HLS live audio feeds
- ⏩ **Seeking**: Seek to any position within a song
- 💾 **Advanced Caching**: Local MP3 caching for instant playback and better performance
- 📋 **No Vote-to-Skip**: This is anarchy, not a democracy
- 🎶 **Songbird API**: Streams directly from the Songbird Music API (no YouTube or Spotify required)
- ↗️ **Custom Shortcuts**: Users can add custom shortcuts (aliases) for quick access
- 1️⃣ **One Song Per Command**: Predictable queue management - one song per `/play` command
- 🔄 **Smart Skipping**: Skip only works when more songs are queued - no errors at end of queue
- 🔊 **Volume Management**: Normalizes volume across tracks with automatic ducking when people speak
- 🌐 **Web Interface**: Optional web UI for managing settings and favorites
- ✍️ **TypeScript**: Written in TypeScript with full type safety, easily extendable
- ❤️ **Loyal Packers fan**

## Table of Contents

- [Quick Start](#-quick-start)
- [Prerequisites](#-prerequisites)
- [Environment Variables](#-environment-variables)
- [Running with Docker](#-running-with-docker)
- [Running with Node.js](#-running-with-nodejs-pm2)
- [Database Setup](#-database-setup)
- [Web Interface](#-web-interface-optional)
- [Health Checks](#-health-checks)
- [Development](#-development)
- [Configuration](#-additional-configuration)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

## 🚀 Quick Start

**The fastest way to get ISOBEL running:**

```bash
# 1. Clone the repository
git clone --recursive https://github.com/soulwax/ISOBEL.git
cd ISOBEL

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env with your credentials (required!)
# You MUST set: DISCORD_TOKEN, SONGBIRD_BASE_URL, SONGBIRD_API_KEY, DATABASE_URL

# 4. Run with Docker (recommended)
docker compose up -d --build

# OR run with Node.js
npm install
npm run build
npm start
```

**Access your bot:**
- Bot will log an invite URL - use it to add ISOBEL to your server
- Health check: http://localhost:3002/health
- Web interface (if enabled): http://localhost:3001

## 📋 Prerequisites

### Required for All Deployments

1. **Discord Bot Token**
   - Create at [Discord Developer Portal](https://discordapp.com/developers/applications)
   - Create a "New Application" → Go to "Bot" → Copy token

2. **Songbird Music API**
   - ISOBEL requires a Songbird API instance for music streaming
   - Set up your own instance or use a hosted service
   - You'll need the base URL and API key

3. **PostgreSQL Database** (NEW - REQUIRED!)
   - ISOBEL uses PostgreSQL for storing settings, favorites, and queue history
   - Options:
     - **Cloud (Recommended)**: [Neon](https://neon.tech), [Supabase](https://supabase.com), [Railway](https://railway.app)
     - **Self-hosted**: PostgreSQL 14+
   - You'll need the connection string (DATABASE_URL)

4. **64-bit Operating System**
   - Required for audio processing

### Required for Docker Deployment

- Docker 20.10+
- Docker Compose v2+

### Required for Node.js Deployment

- Node.js 20.x or later (24.x recommended)
- npm 9.x or later
- ffmpeg 4.1 or later
- PM2 (installed automatically)

## 🔐 Environment Variables

ISOBEL requires several environment variables to run. Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Required Variables

These variables are **REQUIRED** for ISOBEL to start:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your-discord-bot-token-here

# Songbird Music API
SONGBIRD_BASE_URL=https://your-songbird-api-url
SONGBIRD_API_KEY=your-songbird-api-key

# PostgreSQL Database (REQUIRED!)
DATABASE_URL=postgresql://user:password@host:5432/isobel?sslmode=require
```

#### Database URL Examples

**Neon (recommended):**
```env
DATABASE_URL=postgresql://user:pass@ep-cool-darkness-123456.us-east-2.aws.neon.tech/isobel?sslmode=require
```

**Supabase:**
```env
DATABASE_URL=postgresql://postgres:pass@db.projectref.supabase.co:5432/postgres?sslmode=require
```

**Local PostgreSQL:**
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/isobel
```

### Optional Variables

```env
# Bot Data and Cache
DATA_DIR=./data
CACHE_LIMIT=2GB
HEALTH_PORT=3002

# Bot Presence
BOT_STATUS=online                # Options: online, idle, dnd
BOT_ACTIVITY_TYPE=LISTENING      # Options: PLAYING, LISTENING, WATCHING, STREAMING
BOT_ACTIVITY=music
# BOT_ACTIVITY_URL=              # Required ONLY if BOT_ACTIVITY_TYPE=STREAMING

# SponsorBlock Integration (optional)
ENABLE_SPONSORBLOCK=false
SPONSORBLOCK_TIMEOUT=5

# Advanced Configuration
# SONGBIRD_NEXT_URL=             # Alternative Songbird API URL
# REGISTER_COMMANDS_ON_BOT=false # Global vs per-guild command registration
NODE_ENV=production              # Usually set by PM2/Docker automatically
```

### Web Interface Variables (Optional)

Only needed if you want to use the web UI:

```env
# Discord OAuth (for web login)
DISCORD_CLIENT_ID=your-discord-oauth-client-id
DISCORD_CLIENT_SECRET=your-discord-oauth-client-secret

# NextAuth Configuration
NEXTAUTH_SECRET=your-random-secret-here  # Generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3001       # Or your public domain

# Web Service Ports
WEB_PORT=3001        # Web interface
# API_PORT=3003       # Dev only: API server when using npm run web:dev:all
# Note: HEALTH_PORT (3002) is for bot health checks
```

### Verify Your Configuration

Before starting ISOBEL, validate your environment:

```bash
# Check environment variables
npm run verify:env

# Test database connection
npm run verify:db

# Check health (after starting)
npm run health
```

## 🐳 Running with Docker

Docker is the **recommended** deployment method. ISOBEL can be deployed in two configurations:

### Option 1: Bot Only (Recommended)

**Using Docker Compose:**

```bash
# Start the bot
docker compose up -d --build

# View logs
docker compose logs -f bot

# Check health
curl http://localhost:3002/health

# Stop the bot
docker compose down
```

**Using Docker Run:**

```bash
docker run -d \
  --name isobel-bot \
  -v "$(pwd)/data":/data \
  -p 3002:3002 \
  -e DISCORD_TOKEN='your-discord-token' \
  -e SONGBIRD_API_KEY='your-songbird-api-key' \
  -e SONGBIRD_BASE_URL='https://your-api-url' \
  -e DATABASE_URL='postgresql://user:password@host:5432/isobel?sslmode=require' \
  --restart unless-stopped \
  ghcr.io/soulwax/ISOBEL:latest
```

### Option 2: Bot + Web Interface

**Prerequisites:**
1. Create Discord OAuth Application ([guide](https://discord.com/developers/applications))
2. Generate NextAuth secret: `openssl rand -base64 32`
3. Update `.env` with web variables (see [Environment Variables](#-environment-variables))

**Start all services:**

```bash
# Start bot + web interface (single web process: frontend + API + auth)
docker compose -f docker-compose.yml -f docker-compose.web.yml up -d --build

# View logs for all services
docker compose -f docker-compose.yml -f docker-compose.web.yml logs -f

# Check health
curl http://localhost:3002/health  # Bot
curl http://localhost:3001/health  # Web
curl http://localhost:3001/health  # Web (API + frontend)

# Stop all services
docker compose -f docker-compose.yml -f docker-compose.web.yml down
```

**Services included:**
- **bot** (port 3002) - Discord music bot
- **web** (port 3001) - Web interface
- **web** (port 3001) - Web UI, API, and Discord auth (single process)

### Docker Management

```bash
# Update to latest version
docker compose pull
docker compose up -d

# Rebuild from source
docker compose build --no-cache

# View container status
docker compose ps

# Restart services
docker compose restart

# Remove everything (keeps data volume)
docker compose down

# Remove everything INCLUDING data (CAUTION!)
docker compose down -v
```

### Available Docker Images

- `ghcr.io/soulwax/ISOBEL:latest` - Latest release
- `ghcr.io/soulwax/ISOBEL:2` - Version 2.x.x
- `ghcr.io/soulwax/ISOBEL:2.12` - Version 2.12.x
- `ghcr.io/soulwax/ISOBEL:2.12.2` - Exact version

## 🚀 Running with Node.js (PM2)

For running ISOBEL directly with Node.js on your host machine.

### First-Time Setup

```bash
# 1. Clone repository with web submodule
git clone --recursive https://github.com/soulwax/ISOBEL.git
cd ISOBEL

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your values

# 4. Set up database (first time only)
npm run prisma:migrate:deploy

# 5. Build and start
npm run build
npm start
```

### Running on the Same Machine (Bot + Web)

To run both bot and web interface on a single machine without Docker:

```bash
# 1. Install all dependencies
npm install
cd web && npm install && cd ..

# 2. Build everything
npm run build:all

# 3. Start all services with PM2
npm run start:all:prod

# 4. Check status
pm2 status

# 5. View logs
npm run logs:all
```

**Your services will be available at:**
- Bot health: http://localhost:3002/health
- Web interface: http://localhost:3001
- Web (API + auth): http://localhost:3001

### PM2 Management Commands

```bash
# Start services
npm start                        # Bot only
npm run pm2:start:prod          # Bot only (explicit)
npm run web:pm2:start:prod      # Web only
npm run start:all:prod          # Bot + Web + Auth

# Stop services
npm run pm2:stop                # Bot only
npm run web:pm2:stop            # Web only
npm run stop:all                # Everything

# Restart services
npm run pm2:restart             # Bot only
npm run web:pm2:restart         # Web only
npm run restart:all             # Everything

# View logs
npm run pm2:logs                # Bot logs
npm run web:pm2:logs:web        # Web logs
npm run web:pm2:logs:web        # Web logs
npm run logs:all                # All logs

# View status
pm2 status                      # All PM2 processes
pm2 monit                       # Real-time monitoring

# Reset PM2 (nuclear option)
npm run pm2:reset               # Stops and deletes all processes
```

### Development Mode

```bash
# Bot only (with hot reload)
npm run dev

# Web only (with hot reload)
npm run web:dev:all

# Both bot and web (with hot reload)
npm run dev:all
```

### Production Deployment

```bash
# Quick deployment
npm run deploy                  # Builds and starts everything

# Or step by step
npm run build:all              # Build bot and web
npm run start:all:prod         # Start with PM2
pm2 save                       # Save PM2 process list
pm2 startup                    # Enable PM2 on system boot
```

## 🗄️ Database Setup

ISOBEL requires a PostgreSQL database. The database is used to store:
- Guild (server) settings
- User favorites and shortcuts
- Queue history
- Web authentication sessions

### Database Options

#### Option 1: Cloud Database (Recommended)

**Neon (Free tier available):**
1. Create account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string
4. Add to `.env`: `DATABASE_URL=postgresql://...`

**Supabase (Free tier available):**
1. Create account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Settings → Database → Connection String
4. Copy the connection pooler URL
5. Add to `.env`: `DATABASE_URL=postgresql://...`

**Railway:**
1. Create account at [railway.app](https://railway.app)
2. Create PostgreSQL database
3. Copy DATABASE_URL from variables
4. Add to `.env`

#### Option 2: Self-Hosted PostgreSQL

```bash
# Docker PostgreSQL
docker run -d \
  --name isobel-postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=isobel \
  -p 5432:5432 \
  -v isobel-db:/var/lib/postgresql/data \
  postgres:16-alpine

# Then set in .env:
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/isobel
```

### Database Migrations

ISOBEL automatically runs migrations on startup, but you can run them manually:

```bash
# Run pending migrations
npm run prisma:migrate:deploy

# Check migration status
npm run db:status

# Reset database (CAUTION: deletes all data!)
npm run db:reset

# Generate Prisma client after schema changes
npm run prisma:generate
```

### Database Verification

```bash
# Test database connection
npm run verify:db

# This checks:
# - DATABASE_URL is valid
# - PostgreSQL connection works
# - Database is accessible
# - Migrations are up to date
```

## 🌐 Web Interface (Optional)

The web interface provides a modern UI for managing ISOBEL settings, favorites, and more.

### Web Setup

**1. Create Discord OAuth Application:**
- Go to [Discord Developer Portal](https://discord.com/developers/applications)
- Create new application (or use existing bot application)
- Go to OAuth2 → General
- Add redirect URL: `http://your-domain:3001/api/auth/callback/discord`
- Copy Client ID and Client Secret

**2. Generate NextAuth Secret:**
```bash
openssl rand -base64 32
```

**3. Configure Environment:**

Add to your `.env` file:
```env
# Discord OAuth
DISCORD_CLIENT_ID=your-client-id
DISCORD_CLIENT_SECRET=your-client-secret

# NextAuth
NEXTAUTH_SECRET=your-generated-secret
NEXTAUTH_URL=http://localhost:3001  # Or your public domain

# Optional
WEB_PORT=3001
API_PORT=3003
```

**4. Start Web Interface:**

**With Docker:**
```bash
docker compose -f docker-compose.yml -f docker-compose.web.yml up -d --build
```

**With Node.js:**
```bash
cd web && npm install && cd ..
npm run build:all
npm run start:all:prod
```

**5. Access:**
- Open http://localhost:3001
- Click "Login with Discord"
- Authorize the application
- You're in!

### Web Interface Features

- 📊 **Dashboard**: View bot status and active guilds
- 🎵 **Now Playing**: See what's playing across all servers
- ⭐ **Favorites**: Manage favorite songs and playlists
- ⚙️ **Settings**: Configure bot behavior per guild
- 📜 **Queue History**: View playback history
- 👥 **User Management**: See who's using the bot

## 🏥 Health Checks

ISOBEL includes health check endpoints for monitoring:

### Bot Health Check

**Endpoint:** `http://localhost:3002/health`

```bash
# Check bot health
curl http://localhost:3002/health

# Or use npm script
npm run health
```

**Response:**
```json
{
  "status": "ok",
  "uptime": 123456,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "2.12.0"
}
```

### Web Health Check

**Endpoint:** `http://localhost:3001/health`

```bash
# Check web health
curl http://localhost:3001/health

# Or use npm script
npm run health:web
```

### Using Health Checks

**Docker health checks:**
- Automatically configured in docker-compose files
- Check with: `docker compose ps`

**Monitoring:**
- Use with uptime monitoring services (UptimeRobot, Pingdom, etc.)
- Set up alerts for when health checks fail

**Reverse Proxy:**
```nginx
# Nginx example
location /health {
    proxy_pass http://localhost:3002/health;
}
```

## 🔧 Development

### Project Structure

ISOBEL consists of two projects:

```
ISOBEL/
├── src/                    # Bot source code
│   ├── bot.ts             # Main bot entry point
│   ├── commands/          # Discord slash commands
│   ├── services/          # Business logic (DI services)
│   ├── managers/          # Player, queue, cache managers
│   └── utils/             # Utility functions
├── web/                   # Web interface (git submodule)
│   ├── src/               # Web source code
│   ├── public/            # Static assets
│   └── auth-server/       # Auth server
├── prisma/                # Database schema
└── ecosystem.config.cjs   # PM2 configuration
```

### Development Workflow

**1. Clone with submodules:**
```bash
git clone --recursive https://github.com/soulwax/ISOBEL.git
cd ISOBEL
```

**2. Install dependencies:**
```bash
npm install              # Bot dependencies
cd web && npm install    # Web dependencies (optional)
```

**3. Set up environment:**
```bash
cp .env.example .env
# Edit .env with your values
```

**4. Run database migrations:**
```bash
npm run prisma:migrate:dev
```

**5. Start development server:**
```bash
# Bot only
npm run dev

# Web only
npm run web:dev:all

# Both (recommended for full-stack development)
npm run dev:all
```

### Development Commands

```bash
# Code Quality
npm run lint              # Lint bot code
npm run lint:fix          # Auto-fix bot code
npm run lint:all          # Lint bot + web
npm run lint:fix:all      # Auto-fix bot + web
npm run typecheck         # Type check bot
npm run typecheck:all     # Type check bot + web

# Database
npm run prisma:studio     # Open Prisma Studio (database GUI)
npm run prisma:migrate:dev  # Create new migration
npm run prisma:generate   # Generate Prisma client

# Building
npm run build             # Build bot only
npm run build:all         # Build bot + web

# Utilities
npm run verify:env        # Validate environment variables
npm run verify:db         # Test database connection
```

### Making Changes

**Adding a new Discord command:**
1. Create file in `src/commands/`
2. Extend `BaseCommand` class
3. Implement `execute()` method
4. Bot auto-discovers new commands

**Modifying database schema:**
1. Edit `prisma/schema.prisma`
2. Run `npm run prisma:migrate:dev`
3. Name your migration
4. Run `npm run prisma:generate`

**Working on web interface:**
1. `cd web`
2. Make changes in `web/src/`
3. Changes auto-reload in dev mode
4. See [web/README.md](web/README.md) for details

### Git Submodules

The web interface is a git submodule. To update it:

```bash
# Pull latest web changes
git submodule update --remote web

# Or initialize if missing
git submodule update --init --recursive
```

## ⚙️ Additional Configuration

### Cache Management

ISOBEL uses advanced local MP3 caching for better performance.

**Configure cache size:**
```env
CACHE_LIMIT=2GB    # Default
CACHE_LIMIT=512MB  # Smaller
CACHE_LIMIT=10GB   # Larger
```

**Cache location:**
- Docker: `/data/file-cache/`
- Node.js: `./data/file-cache/`

**Clear cache:**
```bash
# Docker
docker compose exec bot rm -rf /data/file-cache/*

# Node.js
rm -rf ./data/file-cache/*
```

### Custom Bot Status

**Examples:**

**Listening to music:**
```env
BOT_STATUS=online
BOT_ACTIVITY_TYPE=LISTENING
BOT_ACTIVITY=music
```

**Watching a movie:**
```env
BOT_STATUS=dnd
BOT_ACTIVITY_TYPE=WATCHING
BOT_ACTIVITY=a movie
```

**Streaming on Twitch:**
```env
BOT_STATUS=online
BOT_ACTIVITY_TYPE=STREAMING
BOT_ACTIVITY=Monstercat
BOT_ACTIVITY_URL=https://www.twitch.tv/monstercat
```

### SponsorBlock Integration

Automatically skip non-music segments:

```env
ENABLE_SPONSORBLOCK=true
SPONSORBLOCK_TIMEOUT=5
```

### Volume Management

Configure automatic volume reduction when people speak:

```
/config set-reduce-vol-when-voice true
/config set-reduce-vol-when-voice-target 70
```

## 🔍 Troubleshooting

### Common Issues

#### "Missing required environment variable"

**Problem:** Bot won't start, complains about missing variables.

**Solution:**
```bash
# Check what's missing
npm run verify:env

# Make sure these are in .env:
# - DISCORD_TOKEN
# - SONGBIRD_BASE_URL
# - SONGBIRD_API_KEY
# - DATABASE_URL
```

#### "Database connection failed"

**Problem:** Can't connect to PostgreSQL.

**Solution:**
```bash
# Test database connection
npm run verify:db

# Common issues:
# - Wrong DATABASE_URL format
# - Database server not running
# - Firewall blocking connection
# - Wrong credentials

# DATABASE_URL format:
postgresql://username:password@host:port/database?sslmode=require
```

#### "Web directory not found"

**Problem:** Web interface submodule not initialized.

**Solution:**
```bash
git submodule update --init --recursive
cd web && npm install
```

#### "PM2 processes stuck"

**Problem:** Can't stop or restart PM2 processes.

**Solution:**
```bash
# Nuclear option - reset everything
npm run pm2:reset

# Then start fresh
npm run start:all:prod
```

#### "Discord bot not responding to commands"

**Problem:** Bot is online but commands don't work.

**Checklist:**
1. Check bot has proper permissions in Discord server
2. Verify bot has "applications.commands" scope
3. Re-invite bot with correct permissions
4. Check logs: `docker compose logs bot` or `npm run pm2:logs`

#### "Port already in use"

**Problem:** Can't start service, port is occupied.

**Solution:**
```bash
# Find what's using the port
lsof -i :3002  # Bot health
lsof -i :3001  # Web
lsof -i :3003  # Dev API server (when using web:dev:all)

# Change port in .env
HEALTH_PORT=3012
WEB_PORT=3011
API_PORT=3013
```

#### "Docker build fails"

**Problem:** Docker build error.

**Solution:**
```bash
# Clear Docker cache and rebuild
docker compose down
docker system prune -a
docker compose build --no-cache
docker compose up -d
```

### Getting Help

**Check logs:**
```bash
# Docker
docker compose logs -f bot
docker compose logs -f web

# PM2
npm run pm2:logs
npm run logs:all
```

**Enable debug mode:**
```env
NODE_ENV=development
```

**Report issues:**
- Check [existing issues](https://github.com/soulwax/ISOBEL/issues)
- Create new issue with:
  - ISOBEL version
  - Node.js version
  - Operating system
  - Complete error logs
  - Steps to reproduce

### Versioning

- `main` branch - Development/bleeding edge (may be unstable)
- Tags - Stable releases (recommended for production)

**Use stable releases:**
```bash
# List available versions
git tag

# Checkout specific version
git checkout v2.12.2
```

## 📚 Additional Resources

- [Web Interface Documentation](web/README.md)
- [CLAUDE.md](CLAUDE.md) - Development guidelines for Claude Code
- [Discord Developer Portal](https://discord.com/developers/applications)
- [Prisma Documentation](https://www.prisma.io/docs)

## 🎵 About Songbird Music API

ISOBEL uses the Songbird Music API for all music streaming and searching. This means:

- ✅ **No YouTube API keys required**
- ✅ **No Spotify credentials required**
- ✅ **Self-hosted or cloud-hosted API support**
- ✅ **High-quality audio streaming (320kbps MP3)**
- ✅ **Fast and reliable search**
- ✅ **Livestream support**

You'll need to set up your own Music API instance or use a hosted service.

## 📝 License

GPLv3 - see [LICENSE](LICENSE.md) file for details.

---

<div align="center">
  Made with ❤️ by music lovers, for music lovers
</div>
