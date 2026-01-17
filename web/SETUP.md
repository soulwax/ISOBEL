# Setup Guide

This guide will help you set up NextAuth with Discord OAuth2 and Drizzle ORM.

## Prerequisites

1. Node.js and npm installed
2. A Discord Application (see below)

## Discord Application Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "OAuth2" section
4. Copy your **Client ID** and **Client Secret**
5. Add redirect URI: `http://localhost:3001/api/auth/callback/discord` (for development)
6. For production, add your production URL: `https://yourdomain.com/api/auth/callback/discord`

## Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in the required values:
   - `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
   - `DISCORD_CLIENT_ID`: From Discord Developer Portal
   - `DISCORD_CLIENT_SECRET`: From Discord Developer Portal
   - `DATABASE_URL`: Path to SQLite database (default: `./data/db.sqlite`)

## Database Setup

1. Generate migration files:
   ```bash
   npm run db:generate
   ```

2. Run migrations to create the database:
   ```bash
   npm run db:migrate
   ```

3. (Optional) Open Drizzle Studio to view your database:
   ```bash
   npm run db:studio
   ```

## Running the Application

1. Start the auth server (in one terminal):
   ```bash
   npm run dev:auth
   ```

2. Start the Vite dev server (in another terminal):
   ```bash
   npm run dev
   ```

The Vite server will proxy `/api/auth/*` requests to the auth server automatically.

## Usage in React Components

```tsx
import { useAuth } from './hooks/useAuth';

function MyComponent() {
  const { session, loading, signIn, signOut, isAuthenticated } = useAuth();

  if (loading) return <div>Loading...</div>;

  if (!isAuthenticated) {
    return <button onClick={signIn}>Sign in with Discord</button>;
  }

  return (
    <div>
      <p>Welcome, {session?.user?.name}!</p>
      <button onClick={signOut}>Sign out</button>
    </div>
  );
}
```

## Database Schema

The database includes the following tables:

- **user**: NextAuth user accounts
- **account**: OAuth account connections
- **session**: User sessions
- **verificationToken**: Email verification tokens
- **discord_user**: Discord user information
- **discord_guild**: Discord server (guild) information
- **guild_member**: Association between users and guilds

## Production Deployment

1. Set `NEXTAUTH_URL` to your production URL
2. Update Discord OAuth2 redirect URIs in Discord Developer Portal
3. Use a production database (PostgreSQL, MySQL, etc.) instead of SQLite
4. Update `DATABASE_URL` in your environment variables
5. Ensure both servers are running or use a reverse proxy

