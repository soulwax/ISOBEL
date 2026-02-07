# Docker Ecosystem Overview

This document explains how ISOBEL's Docker ecosystem is structured to support both the bot and web interface.

## Architecture

ISOBEL consists of **three separate services** that can be deployed together or independently:

```
┌─────────────────────────────────────────────────┐
│              ISOBEL Ecosystem                   │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────┐│
│  │   Discord   │  │     Web     │  │  Auth   ││
│  │     Bot     │  │  Interface  │  │ Server  ││
│  │             │  │             │  │         ││
│  │   (Always   │  │  (Optional) │  │(Optional)││
│  │   Required) │  │  Port 3001  │  │Port 3003││
│  └──────┬──────┘  └──────┬──────┘  └────┬────┘│
│         │                │              │     │
│         └────────────────┴──────────────┘     │
│                      │                        │
│              ┌───────▼────────┐               │
│              │  Shared Volume │               │
│              │   /data        │               │
│              │                │               │
│              │ • database.db  │               │
│              │ • file-cache/  │               │
│              │ • logs/        │               │
│              └────────────────┘               │
└─────────────────────────────────────────────────┘
```

## Services

### 1. Discord Bot (Required)
- **Image**: `ghcr.io/soulwax/ISOBEL:latest` or build from `./Dockerfile`
- **Purpose**: Core Discord music bot functionality
- **Dependencies**: None
- **Ports**: None exposed (Discord WebSocket connection only)
- **Data**: Writes to `/data` volume

### 2. Web Interface (Optional)
- **Build**: `./web/Dockerfile`
- **Purpose**: Web UI for managing bot settings
- **Dependencies**: Requires bot (shares database)
- **Ports**: 3001 (configurable via `WEB_PORT`)
- **Data**: Reads from `/data` volume (shared with bot)

### 3. Auth Server (Optional)
- **Build**: `./web/Dockerfile.auth`
- **Purpose**: NextAuth authentication for web interface
- **Dependencies**: Requires bot
- **Ports**: 3003 (configurable via `AUTH_PORT`)
- **Data**: None

## Deployment Scenarios

### Scenario 1: Bot Only (Recommended for Most Users)

**Why:** Just want Discord music bot functionality, no web interface needed.

**How:**
```bash
# Option A: Docker Run
docker run -d \
  --name isobel-bot \
  -v ./data:/data \
  -e DISCORD_TOKEN=xxx \
  -e SONGBIRD_API_KEY=xxx \
  -e SONGBIRD_BASE_URL=xxx \
  ghcr.io/soulwax/ISOBEL:latest

# Option B: Docker Compose (bot only)
docker-compose up -d
```

**What runs:**
- ✅ Discord Bot
- ❌ Web Interface
- ❌ Auth Server

### Scenario 2: Bot + Web Interface (Full Stack)

**Why:** Want both Discord bot AND web UI for managing settings.

**How:**
```bash
# Step 1: Configure environment variables
cp .env.example .env
# Edit .env with both bot and web credentials

# Step 2: Start all services
docker-compose --profile with-web up -d
```

**What runs:**
- ✅ Discord Bot
- ✅ Web Interface (port 3001)
- ✅ Auth Server (port 3003)

## File Structure

```
ISOBEL/
├── Dockerfile                 # Bot-only image
├── docker-compose.yml         # Orchestrates all services
├── .dockerignore              # What to exclude from builds
├── .env.example               # Template for environment variables
├── .env                       # Your actual env vars (git-ignored)
│
├── web/                       # Web interface submodule
│   ├── Dockerfile            # Web interface image
│   ├── Dockerfile.auth       # Auth server image
│   └── ecosystem.config.cjs  # PM2 config for web + auth
│
└── ecosystem.config.cjs       # PM2 config for bot
```

## Environment Variables

### Bot (Required Always)
```env
DISCORD_TOKEN=your-bot-token
SONGBIRD_BASE_URL=https://api.example.com
SONGBIRD_API_KEY=your-api-key
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

### Web Interface (Required Only with `--profile with-web`)
```env
DISCORD_CLIENT_ID=your-oauth-client-id
DISCORD_CLIENT_SECRET=your-oauth-client-secret
NEXTAUTH_SECRET=random-secret-generate-with-openssl
NEXTAUTH_URL=http://localhost:3001
```

### Optional (Both)
```env
CACHE_LIMIT=2GB
BOT_STATUS=online
WEB_PORT=3001
AUTH_PORT=3003
HEALTH_PORT=3002
SONGBIRD_NEXT_URL=https://songbirdapi.com
```

## Docker Compose Profiles

The `docker-compose.yml` uses **profiles** to control which services start:

**Default profile (no flag):**
- Starts: Bot only
- Command: `docker-compose up -d`

**with-web profile:**
- Starts: Bot + Web + Auth
- Command: `docker-compose --profile with-web up -d`

This allows the same `docker-compose.yml` to support both deployment scenarios!

## Volume Management

### Shared Data Volume

All services share the `/data` volume:

```bash
./data/
├── file-cache/         # Cached MP3 files
│   ├── abc123.mp3
│   ├── def456.mp3
│   └── ...
│
└── logs/               # Application logs
    ├── pm2-error.log
    ├── pm2-out.log
    └── ...
```

**Note:** Database (Guild settings, favorites, cache metadata) is stored in PostgreSQL configured via `DATABASE_URL`, not in the `/data` volume.

**Important:**
- Bot: Read/Write access to `/data`
- Web: Read-only access to `/data` (via `ro` mount)
- Auth: No access to `/data`

## Common Commands

### Starting Services

```bash
# Bot only
docker-compose up -d

# Bot + Web + Auth
docker-compose --profile with-web up -d

# Specific service
docker-compose up -d bot
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f bot
docker-compose logs -f web
docker-compose logs -f auth

# Last 100 lines
docker-compose logs --tail=100
```

### Stopping Services

```bash
# Stop all running services
docker-compose down

# Stop specific service
docker-compose stop bot

# Stop and remove volumes (DANGER: deletes data!)
docker-compose down -v
```

### Building Images

```bash
# Build all images
docker-compose build

# Build with web profile
docker-compose --profile with-web build

# Build specific service
docker-compose build bot
```

### Updating

```bash
# Pull latest images
docker-compose pull

# Rebuild and restart
docker-compose up -d --build

# Update specific service
docker-compose pull bot
docker-compose up -d bot
```

## Health Checks

All services include health checks:

```yaml
# Bot health check
test: ["CMD", "node", "-e", "process.exit(0)"]

# Web health check
test: ["CMD", "wget", "--spider", "http://localhost:3001/health"]

# Auth health check
test: ["CMD", "wget", "--spider", "http://localhost:3003/health"]
```

**Check health status:**
```bash
docker ps  # Shows health status in STATUS column
docker-compose ps  # Docker Compose status
```

## Networking

All services are connected via the `isobel-network` bridge network:

- **Internal communication:** Services can communicate using service names
  - Bot → Web: `http://web:3001`
  - Web → Auth: `http://auth:3003`

- **External access:**
  - Bot: No ports exposed (connects to Discord via WebSocket)
  - Web: Port 3001 → http://localhost:3001
  - Auth: Port 3003 → http://localhost:3003

## Troubleshooting

### Web services can't access database

**Symptom:** Web interface shows "Database not found" error

**Cause:** `DATABASE_URL` not set or incorrect, or database not accessible

**Fix:**
```bash
# Check DATABASE_URL is set
docker-compose config | grep DATABASE_URL

# Verify database connection
docker exec isobel-bot node -e "console.log(process.env.DATABASE_URL)"

# Ensure PostgreSQL is accessible from container
# Test connection from host: psql $DATABASE_URL
```

### Services won't start with --profile

**Symptom:** `docker-compose --profile with-web up -d` only starts bot

**Cause:** Older Docker Compose version

**Fix:**
```bash
# Update Docker Compose to v1.28+
docker-compose --version

# Or use docker compose (v2)
docker compose --profile with-web up -d
```

### Bot can't connect to Discord

**Symptom:** Bot exits immediately with authentication error

**Cause:** Missing or incorrect `DISCORD_TOKEN`

**Fix:**
```bash
# Check environment variables
docker-compose config

# Verify .env file
cat .env | grep DISCORD_TOKEN
```

### Port conflicts

**Symptom:** "Port already in use" error

**Cause:** Another service using port 3001 or 3003

**Fix:**
```bash
# Check what's using the ports
lsof -i :3001
lsof -i :3003

# Change ports in .env
WEB_PORT=3002
AUTH_PORT=3004
```

## Security Considerations

1. **Never commit .env files** - Use `.env.example` as a template
2. **Restrict .env permissions** - `chmod 600 .env`
3. **Use Docker secrets in production** - Don't pass secrets via environment variables
4. **Keep images updated** - Regularly pull latest images
5. **Use read-only mounts** - Web has `ro` access to `/data`
6. **Network isolation** - Services communicate via internal network only

## Production Deployment

For production deployments:

1. **Use Docker Secrets:**
   ```yaml
   services:
     bot:
       secrets:
         - discord_token
         - starchild_api_key

   secrets:
     discord_token:
       external: true
     starchild_api_key:
       external: true
   ```

2. **Enable restart policies:**
   ```yaml
   restart: unless-stopped  # Already configured
   ```

3. **Configure resource limits:**
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '2'
         memory: 2G
       reservations:
         memory: 512M
   ```

4. **Use specific image tags:**
   ```yaml
   image: ghcr.io/soulwax/ISOBEL:2.16.0  # Not :latest
   ```

5. **Set up monitoring:**
   - Use health checks (already configured)
   - Monitor logs with external service
   - Set up alerts for container failures

## Summary

The ISOBEL Docker ecosystem is designed to be:

- **Flexible**: Run bot-only or full-stack
- **Simple**: Single `docker-compose.yml` for both scenarios
- **Secure**: Read-only mounts, network isolation
- **Production-ready**: Health checks, restart policies, resource limits
- **Maintainable**: Clear separation of concerns, easy to update

Choose the deployment scenario that fits your needs, and the ecosystem handles the rest!
