# Session Changelog - ISOBEL Cleanup & Improvements

**Date:** 2024-02-13
**Session Focus:** Comprehensive cleanup, environment variable fixes, Docker improvements, and documentation

---

## 🎯 Major Changes

### 1. Environment Variable Overhaul

#### Fixed Missing DATABASE_URL
- **Critical Fix:** Added missing `DATABASE_URL` to root `.env.local`
- **Impact:** Bot will now start correctly with database connection
- **Files Changed:**
  - `.env.local` - Added PostgreSQL connection string

#### Updated .env.example Files
- **Root `.env.example`:**
  - ✅ Added `DATABASE_URL` with PostgreSQL examples (Local, Neon, Supabase)
  - ✅ Added missing `HEALTH_PORT=3002`
  - ✅ Added `ENABLE_SPONSORBLOCK` and `SPONSORBLOCK_TIMEOUT`
  - ✅ Added `SONGBIRD_NEXT_URL` documentation
  - ✅ Clarified port structure (3001=web, 3002=health, 3003=auth)
  - ✅ Reorganized into clear REQUIRED vs OPTIONAL sections
  - ✅ Fixed all examples and comments

- **web/.env.example:**
  - ✅ Removed unused `DISCORD_OAUTH_CALLBACK_PATH`
  - ✅ Consolidated database configuration
  - ✅ Moved Vercel-specific variables to optional section
  - ✅ Added clear structure and examples

#### Fixed TypeScript Environment Types
- **File:** `web/env.d.ts`
  - ❌ Removed unused `VITE_API_URL`
  - ✅ Added actually-used `VITE_AUTH_API_URL`

---

### 2. NPM Scripts Cleanup

#### Root package.json Changes
- **Removed duplicates:**
  - ❌ `build:bot` (duplicate of `build`)
  - ❌ `pm2:start` (duplicate of `pm2:start:prod`)

- **Fixed existing scripts:**
  - ✅ `build:all` - Now uses `npm run build` instead of removed `build:bot`
  - ✅ `start:all` - Now uses `npm run pm2:start:prod` instead of removed `pm2:start`

- **Added new utility scripts:**
  - ✅ `verify:env` - Validate environment variables
  - ✅ `verify:db` - Test database connection
  - ✅ `deploy` - Build and start everything in one command
  - ✅ `deploy:dev` - Deploy in development mode
  - ✅ `db:status` - Check migration status
  - ✅ `db:reset` - Reset database (with caution)
  - ✅ `health` - Check bot health endpoint
  - ✅ `health:web` - Check web health endpoint

#### Web package.json Changes
- **Fixed PM2 consistency:**
  - Changed from using config file paths to app names
  - `pm2:stop` now uses `pm2 stop isobel-web isobel-auth`
  - `pm2:restart` now uses `pm2 restart isobel-web isobel-auth --update-env`
  - Better alignment with root package.json patterns

---

### 3. Docker Configuration Improvements

#### docker-compose.yml (Bot Service)
- **Health check upgrade:**
  - ❌ Before: Basic Node.js check `node -e "process.exit(0)"`
  - ✅ After: Real health endpoint check using wget
  - Added proper intervals, timeouts, retries, and start period

- **Resource limits added:**
  ```yaml
  deploy:
    resources:
      limits:
        memory: 1G
        cpus: '1.0'
      reservations:
        memory: 512M
  ```

- **Fixed environment defaults:**
  - `BOT_ACTIVITY` default changed from "the Songbird" to "music" (matches .env.example)

#### docker-compose.web.yml (Web Services)
- **Critical database fix:**
  - ❌ Before: Hardcoded SQLite `file:/data/database.sqlite`
  - ✅ After: PostgreSQL from environment `DATABASE_URL=${DATABASE_URL}`

- **Web service improvements:**
  - ✅ Added proper health checks using wget
  - ✅ Added `BOT_HEALTH_URL` environment variable
  - ✅ Added `DATA_DIR` environment variable

- **Auth service improvements:**
  - ✅ Added missing `DATABASE_URL` (critical for NextAuth sessions)
  - ✅ Added proper health checks
  - ✅ Fixed all environment variable mappings

#### Created Missing Web Dockerfiles
- **web/Dockerfile (NEW FILE):**
  - Multi-stage build for Vite web interface
  - Stage 1: Builder with pnpm
  - Stage 2: Production with only runtime deps
  - Health check endpoint configured
  - Proper port exposure (3001)

- **web/Dockerfile.auth (NEW FILE):**
  - Auth server with tsx runtime
  - Production-ready with health checks
  - Proper port exposure (3003)

---

### 4. New Utility Files Created

#### src/utils/env-validation.ts (NEW FILE)
Comprehensive environment variable validation utilities:
- `validateRequiredEnv()` - Check required variables exist
- `validatePostgresUrl()` - Validate DATABASE_URL format
- `validateDiscordToken()` - Validate Discord token format (3 parts)
- `validateUrl()` - General URL validation
- `validateBotEnvironment()` - Validate all bot env vars
- `printValidationResults()` - Pretty print errors/warnings

#### src/scripts/verify-environment.ts (NEW FILE)
Standalone script to verify environment configuration:
- Validates all required variables
- Checks formats (Discord token, URLs, DATABASE_URL)
- Provides helpful error messages
- Exits with code 1 if validation fails
- Run with: `npm run verify:env`

#### src/scripts/verify-database.ts (NEW FILE)
Database connection tester:
- Tests PostgreSQL connection
- Validates DATABASE_URL format
- Checks if migrations are applied
- Provides helpful troubleshooting for common issues
- Run with: `npm run verify:db`

---

### 5. Documentation Complete Rewrite

#### README.md (COMPLETELY REWRITTEN)
Created comprehensive documentation with:

**New Sections Added:**
- 📋 Table of Contents
- 🚀 Quick Start guide
- 📋 Prerequisites (including PostgreSQL requirement!)
- 🔐 Detailed environment variables section
- 🐳 Docker deployment (bot only + bot+web)
- 🚀 Node.js/PM2 deployment guide
- 🗄️ **Database Setup** (NEW - critical section)
- 🌐 Web Interface setup guide
- 🏥 Health Checks documentation
- 🔧 Development workflow
- ⚙️ Configuration options
- 🔍 **Troubleshooting** (NEW - with common issues)
- 📚 Additional resources

**Key Improvements:**
- Clear DATABASE_URL requirement throughout
- Step-by-step database setup (Neon, Supabase, Railway, self-hosted)
- Database migration commands documented
- All new npm scripts documented
- Port structure clearly explained (3001=web, 3002=health, 3003=auth)
- Web Docker instructions with both bot-only and full-stack options
- Troubleshooting for 10+ common issues
- Environment validation instructions

---

## 📊 Files Modified Summary

### Configuration Files
- ✏️ `.env.local` - Added DATABASE_URL
- ✏️ `.env.example` - Complete rewrite
- ✏️ `web/.env.example` - Complete rewrite
- ✏️ `web/env.d.ts` - Fixed TypeScript types

### Build & Deploy
- ✏️ `package.json` (root) - Cleaned scripts, added utilities
- ✏️ `web/package.json` - Fixed PM2 consistency
- ✏️ `docker-compose.yml` - Health checks, resource limits
- ✏️ `docker-compose.web.yml` - Critical database fixes
- ✏️ `Dockerfile` - Fixed build script (build:bot → build)

### New Files Created
- ✨ `src/utils/env-validation.ts` - Validation utilities
- ✨ `src/scripts/verify-environment.ts` - Env verification script
- ✨ `src/scripts/verify-database.ts` - DB connection tester
- ✨ `web/Dockerfile` - Web interface Docker build
- ✨ `web/Dockerfile.auth` - Auth server Docker build
- ✨ `README.md` - Complete documentation rewrite
- ✨ `CHANGELOG_SESSION.md` - This file!

---

## 🎯 Breaking Changes & Migration Notes

### For Existing Users

1. **DATABASE_URL Now Required**
   - Must be added to `.env` or `.env.local`
   - Format: `postgresql://user:pass@host:port/dbname?sslmode=require`
   - See README.md for examples (Neon, Supabase, local)

2. **Renamed NPM Scripts**
   - ❌ `npm run build:bot` → ✅ `npm run build`
   - ❌ `npm run pm2:start` → ✅ `npm run pm2:start:prod`

3. **Docker Web Configuration Changed**
   - Now requires PostgreSQL (no more SQLite)
   - DATABASE_URL must be set in environment
   - Auth service now requires DATABASE_URL

4. **Port Clarification**
   - `HEALTH_PORT=3002` - Bot health endpoint
   - `WEB_PORT=3001` - Web interface
   - `AUTH_PORT=3003` - Authentication server

---

## ✅ Verification Steps

After updating, verify everything works:

```bash
# 1. Verify environment configuration
npm run verify:env

# 2. Test database connection
npm run verify:db

# 3. Build everything
npm run build:all

# 4. Start services (choose one)
# Docker:
docker compose up -d --build
# OR Docker with web:
docker compose -f docker-compose.yml -f docker-compose.web.yml up -d --build
# OR Node.js:
npm run start:all:prod

# 5. Check health
npm run health              # Bot
npm run health:web          # Web (if running)
curl http://localhost:3002/health  # Bot
curl http://localhost:3001/health  # Web (if running)
curl http://localhost:3003/health  # Auth (if running)

# 6. Check logs
# Docker:
docker compose logs -f
# Node.js:
npm run logs:all
```

---

## 🚀 New Features Available

### Environment Validation
```bash
npm run verify:env    # Validate all env vars
npm run verify:db     # Test database connection
```

### Quick Deployment
```bash
npm run deploy        # Build and start everything
npm run deploy:dev    # Deploy in development mode
```

### Health Monitoring
```bash
npm run health        # Check bot health
npm run health:web    # Check web health
```

### Database Management
```bash
npm run db:status     # Check migration status
npm run db:reset      # Reset database (caution!)
```

---

## 📝 Next Steps (Optional - Not Done Yet)

These were planned but not implemented yet:

1. Update CLAUDE.md with new environment variable documentation
2. Create SETUP.md with step-by-step first-time setup guide
3. Add environment validation to `src/scripts/migrate-and-start.ts`
4. Consider adding environment variable validation on Docker startup

---

## 🎉 Summary

**Total Files Changed:** 13
**New Files Created:** 7
**Scripts Added:** 8
**Critical Bugs Fixed:** 3 (DATABASE_URL missing, Docker SQLite, Docker health)
**Documentation:** Completely rewritten

**Impact:**
- ✅ More intuitive setup process
- ✅ Better error messages and debugging
- ✅ Comprehensive documentation
- ✅ Production-ready Docker configuration
- ✅ Environment validation tools
- ✅ Consistent command patterns
- ✅ No duplicate or confusing scripts

---

**Questions or issues?** Check the updated [README.md](README.md) troubleshooting section!
