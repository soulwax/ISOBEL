# Vercel Deployment Guide

This guide explains how to deploy the ISOBEL web application to Vercel.

## Prerequisites

1. A Vercel account (sign up at [vercel.com](https://vercel.com))
2. A Neon PostgreSQL database (or any PostgreSQL database)
3. Discord OAuth credentials
4. All environment variables configured

## Project Structure

The project is configured for Vercel deployment with:

- **Static Frontend**: Built with Vite, output to `./build`
- **API Routes**: Serverless functions in `/api` directory
- **Express Server**: Wrapped as Vercel serverless function

## Environment Variables

Configure the following environment variables in Vercel:

### Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database
# or
POSTGRES_URL=postgresql://user:password@host:5432/database

# NextAuth
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=https://your-domain.vercel.app

# Discord OAuth
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret

# Frontend URL (should match your Vercel domain)
FRONTEND_URL=https://your-domain.vercel.app
```

### Optional Variables

```bash
# Bot Health Check - Frontend (exposed to browser, defaults to https://isobelhealth.soulwax.dev)
# The frontend calls this directly to display bot status
VITE_BOT_HEALTH_URL=https://isobelhealth.soulwax.dev

# Starchild API (if applicable)
STARCHILD_API_URL=https://api.starchildmusic.com

# Node Environment
NODE_ENV=production
```

## Deployment Steps

### 1. Install Vercel CLI (Optional)

```bash
npm i -g vercel
```

### 2. Link Your Project

```bash
vercel link
```

### 3. Set Environment Variables

Via Vercel Dashboard:
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add all required variables listed above

Or via CLI:
```bash
vercel env add DATABASE_URL
vercel env add NEXTAUTH_SECRET
vercel env add NEXTAUTH_URL
vercel env add DISCORD_CLIENT_ID
vercel env add DISCORD_CLIENT_SECRET
vercel env add FRONTEND_URL
```

### 4. Deploy

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

Or push to your connected Git repository - Vercel will auto-deploy.

## Build Configuration

The project uses the following build configuration:

- **Build Command**: `npm run build`
- **Output Directory**: `build`
- **Framework**: Vite
- **Node Version**: 20.x (configured in `vercel.json`)

## API Routes

All API routes are handled by a single serverless function at `/api/index.ts`:

- `/api/auth/*` - NextAuth authentication routes
- `/api/guilds` - Get user's Discord guilds
- `/api/guilds/:guildId/settings` - Get/update guild settings

**Note:** The bot health status is fetched directly from `https://isobelhealth.soulwax.dev/health` by the frontend (CORS enabled).

## Database Migrations

Before deploying, ensure your database schema is up to date:

```bash
# Generate migrations
npm run db:generate

# Push schema to database (development)
npm run db:push

# Or run migrations (production)
npm run db:migrate
```

**Note**: You may need to run migrations manually on your production database, or set up a migration script that runs on Vercel deployment.

## CORS Configuration

CORS is configured in the Express app (`src/server/app.ts`). In production, only the `FRONTEND_URL` origin is allowed. Make sure `FRONTEND_URL` matches your Vercel deployment URL.

## Connection Pooling

The PostgreSQL client is configured with connection pooling suitable for serverless:

```typescript
const client = postgres(databaseUrl, {
  max: 10, // Maximum connections in pool
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout
});
```

For serverless environments, consider using a connection pooler like:
- Neon's built-in connection pooling
- PgBouncer
- Supabase connection pooling

## Troubleshooting

### Database Connection Issues

If you encounter connection issues:

1. **Check connection string format**: Must be a valid PostgreSQL connection string
2. **Verify database is accessible**: Ensure your database allows connections from Vercel's IP ranges
3. **Use connection pooling**: For serverless, use a connection pooler to avoid connection limits
4. **Check environment variables**: Ensure `DATABASE_URL` or `POSTGRES_URL` is set correctly

### CORS Errors

If you see CORS errors:

1. Verify `FRONTEND_URL` matches your Vercel deployment URL exactly
2. Check that `NEXTAUTH_URL` is set correctly
3. Review CORS middleware in `src/server/app.ts`

### Build Failures

If the build fails:

1. Check that all dependencies are in `package.json`
2. Verify TypeScript compilation: `npm run build` locally
3. Check Vercel build logs for specific errors
4. Ensure `@vercel/node` is installed (included in `devDependencies`)

### Function Timeout

If API requests timeout:

1. Increase `maxDuration` in `vercel.json` (currently 30 seconds)
2. Optimize database queries
3. Check for long-running operations

## Local Testing

Test the Vercel build locally:

```bash
# Install Vercel CLI
npm i -g vercel

# Run Vercel dev server
vercel dev
```

This will simulate the Vercel environment locally.

## Production Checklist

- [ ] All environment variables configured in Vercel
- [ ] Database migrations run on production database
- [ ] `FRONTEND_URL` matches Vercel deployment URL
- [ ] `NEXTAUTH_URL` matches Vercel deployment URL
- [ ] Discord OAuth redirect URIs updated to include Vercel domain
- [ ] CORS configuration verified
- [ ] Database connection pooling configured (if needed)
- [ ] Build succeeds locally: `npm run build`
- [ ] API routes tested in preview deployment

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Neon PostgreSQL](https://neon.tech/docs)
- [NextAuth.js Documentation](https://next-auth.js.org)
