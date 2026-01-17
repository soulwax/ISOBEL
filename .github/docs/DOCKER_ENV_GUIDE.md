# Docker Environment Variables Guide

This guide explains how to use environment variables with Docker Compose for ISOBEL.

## 🔑 How Docker Compose Loads .env Files

Docker Compose **automatically** reads `.env` files from the same directory as `docker-compose.yml`. No extra configuration needed!

```
ISOBEL/
├── docker-compose.yml    ← Docker Compose config
├── .env                  ← Your environment variables (AUTO-LOADED!)
└── .env.example          ← Template to copy from
```

## 📋 Quick Start

### Step 1: Create Your .env File

```bash
# Copy the example template
cp .env.example .env

# Edit with your actual credentials
nano .env  # or vim, code, etc.
```

### Step 2: Fill in Required Variables

**Minimum required for bot:**
```env
DISCORD_TOKEN=your-discord-bot-token
SONGBIRD_BASE_URL=https://your-api-url
SONGBIRD_API_KEY=your-api-key
```

**If using web interface, also add:**
```env
DISCORD_CLIENT_ID=your-oauth-client-id
DISCORD_CLIENT_SECRET=your-oauth-client-secret
NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=http://localhost:3001
```

### Step 3: Build and Run

```bash
# Build and start (pulls variables from .env automatically!)
docker compose up -d --build

# Verify variables were loaded
docker compose config
```

## ✅ How to Verify .env is Loaded

### Method 1: Check Parsed Config
```bash
docker compose config
```
This shows the final config with all variables substituted. You should see your actual values (not `${VARIABLE_NAME}`).

### Method 2: Inspect Running Container
```bash
# Check bot environment variables
docker inspect isobel-bot | grep -A 20 "Env"

# Or more readable
docker exec isobel-bot env | grep DISCORD_TOKEN
```

### Method 3: Check Logs
```bash
# Bot will log errors if variables are missing
docker compose logs bot

# Look for "Missing environment variable" errors
```

## 🔍 Variable Syntax in docker-compose.yml

Docker Compose supports several syntaxes:

### Basic Substitution
```yaml
environment:
  - DISCORD_TOKEN=${DISCORD_TOKEN}
```
- Reads from `.env` file
- **Error if variable not set!**

### With Default Value
```yaml
environment:
  - CACHE_LIMIT=${CACHE_LIMIT:-2GB}
```
- Uses `.env` value if set
- Falls back to `2GB` if not set
- **Recommended for optional variables**

### Hardcoded (No .env)
```yaml
environment:
  - NODE_ENV=production
```
- Always uses this value
- Ignores `.env` file

## 📝 Complete .env Example

Here's a complete example with all variables:

```env
# ============================================
# REQUIRED: Discord Bot Configuration
# ============================================
DISCORD_TOKEN=your-discord-bot-token

# ============================================
# REQUIRED: Songbird Music API Configuration
# ============================================
SONGBIRD_BASE_URL=https://api.example.com
SONGBIRD_API_KEY=your-songbird-api-key

# ============================================
# OPTIONAL: Bot Data & Caching
# ============================================
DATA_DIR=./data
CACHE_LIMIT=5GB

# ============================================
# OPTIONAL: Bot Status & Activity
# ============================================
BOT_STATUS=online
BOT_ACTIVITY_TYPE=LISTENING
BOT_ACTIVITY=music

# ============================================
# OPTIONAL: Web Interface Configuration
# (Only needed with --profile with-web)
# ============================================
DISCORD_CLIENT_ID=your-oauth-client-id
DISCORD_CLIENT_SECRET=your-oauth-client-secret
NEXTAUTH_SECRET=super-secret-random-string-generated-with-openssl
NEXTAUTH_URL=http://localhost:3001

# Web/Auth Ports
WEB_PORT=3001
AUTH_PORT=3003

# ============================================
# OPTIONAL: Docker Build Arguments
# ============================================
COMMIT_HASH=main
BUILD_DATE=2026-01-17
```

## 🚀 Common Workflows

### Deploy Bot Only
```bash
# 1. Set up .env
cp .env.example .env
nano .env  # Add DISCORD_TOKEN, SONGBIRD_BASE_URL, SONGBIRD_API_KEY

# 2. Build and run
docker compose up -d --build

# 3. Verify
docker compose logs -f bot
```

### Deploy Bot + Web
```bash
# 1. Set up .env
cp .env.example .env
nano .env  # Add bot vars + web OAuth vars

# 2. Build and run with web profile
docker compose --profile with-web up -d --build

# 3. Verify all services
docker compose ps
docker compose logs -f
```

### Update Environment Variables
```bash
# 1. Edit .env
nano .env

# 2. Recreate containers (picks up new variables)
docker compose up -d --force-recreate

# 3. Verify
docker compose config
```

## 🔒 Security Best Practices

### 1. Never Commit .env Files
```bash
# Already in .gitignore - double check:
cat .gitignore | grep "\.env"

# Output should show:
# .env
# .env.test
# .env.local
# !.env.example  ← Only this is tracked!
```

### 2. Restrict .env Permissions
```bash
# Only your user can read
chmod 600 .env

# Verify
ls -la .env
# Should show: -rw-------
```

### 3. Use Docker Secrets in Production
For production, consider using Docker secrets instead:

```yaml
services:
  bot:
    secrets:
      - discord_token
      - songbird_api_key
    environment:
      - DISCORD_TOKEN_FILE=/run/secrets/discord_token

secrets:
  discord_token:
    external: true
  songbird_api_key:
    external: true
```

### 4. Use .env.local for Local Overrides
```bash
# .env - committed defaults (use .env.example)
# .env.local - your personal overrides (git-ignored)

# Docker Compose loads both, with .env.local taking precedence
```

## 🐛 Troubleshooting

### Problem: Variables Not Loaded

**Symptom:**
```bash
docker compose config
# Shows: DISCORD_TOKEN=${DISCORD_TOKEN}
```

**Causes & Solutions:**

1. **.env file in wrong location**
   ```bash
   # Must be in same dir as docker-compose.yml
   ls -la .env
   pwd  # Should be ISOBEL root
   ```

2. **.env file has wrong format**
   ```bash
   # Correct format (no spaces around =)
   DISCORD_TOKEN=abc123

   # Wrong formats:
   DISCORD_TOKEN = abc123       ❌ (spaces)
   export DISCORD_TOKEN=abc123  ❌ (don't use export)
   DISCORD_TOKEN="abc123"       ⚠️  (quotes included in value!)
   ```

3. **Variable not defined in .env**
   ```bash
   # Check what's in your .env
   cat .env

   # Add missing variable
   echo "DISCORD_TOKEN=your-token" >> .env
   ```

### Problem: Bot Exits with "Missing environment variable"

**Symptom:**
```bash
docker compose logs bot
# Error: Missing environment variable for DISCORD_TOKEN
```

**Solution:**
```bash
# 1. Check .env has the variable
cat .env | grep DISCORD_TOKEN

# 2. Verify docker-compose.yml passes it
docker compose config | grep DISCORD_TOKEN

# 3. Recreate container
docker compose up -d --force-recreate bot
```

### Problem: Changes to .env Not Taking Effect

**Solution:**
```bash
# Docker caches environment variables!
# Must recreate containers:
docker compose down
docker compose up -d

# Or force recreate:
docker compose up -d --force-recreate
```

### Problem: Quotes in Values

**.env file:**
```env
# Don't use quotes (they become part of the value!)
DISCORD_TOKEN=abc123              ✅ Good
DISCORD_TOKEN="abc123"            ❌ Bad (includes quotes)
SONGBIRD_BASE_URL=https://api.com ✅ Good (URL needs no quotes)
```

## 📊 Environment Variable Priority

Docker Compose uses this order (highest to lowest priority):

1. **docker-compose.yml `environment:`** - Hardcoded values
2. **.env file** - Your local environment file
3. **Shell environment** - Variables exported in your shell
4. **Default values** - `${VAR:-default}` syntax

Example:
```bash
# .env file
CACHE_LIMIT=5GB

# docker-compose.yml
environment:
  - CACHE_LIMIT=${CACHE_LIMIT:-2GB}  # Uses 5GB from .env

# If .env doesn't have CACHE_LIMIT
  - CACHE_LIMIT=${CACHE_LIMIT:-2GB}  # Falls back to 2GB
```

## 🎯 Quick Reference

| Task | Command |
|------|---------|
| Create .env | `cp .env.example .env` |
| Edit .env | `nano .env` |
| Verify variables | `docker compose config` |
| Start with .env | `docker compose up -d` |
| Reload .env changes | `docker compose up -d --force-recreate` |
| Check bot env | `docker exec isobel-bot env` |
| View parsed config | `docker compose config \| less` |

## ✨ Summary

1. **.env files are AUTO-LOADED** - Just put them in the same directory as `docker-compose.yml`
2. **Use `.env.example` as a template** - Copy and fill in your values
3. **Never commit .env** - It contains secrets!
4. **Recreate containers** after changing .env - `docker compose up -d --force-recreate`
5. **Verify with `docker compose config`** - Shows final values

That's it! Docker Compose handles the rest automatically. 🎉
