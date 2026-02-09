# ISOBEL Web Interface

A professional React web interface for the ISOBEL Discord music bot.

## Development

```bash
# Install dependencies
npm install

# Start development server (frontend only)
npm run dev

# Start development server (frontend + auth API)
npm run dev:all

# Build for production
npm run build

# Preview production build
npm run preview
```

## Features

- 🎨 Modern, professional landing page
- 📱 Fully responsive design
- 🎯 Showcases all bot features
- ⚡ Built with Vite for fast development and builds
- 🎨 Discord-inspired color scheme
- 🔐 Discord OAuth authentication
- ⚙️ Guild settings management

## Tech Stack

- React 19
- TypeScript
- Vite
- Express (API server)
- NextAuth.js (Discord OAuth)
- Drizzle ORM (PostgreSQL)
- CSS3 (no external CSS frameworks)

## Vercel Deployment

### Prerequisites

1. A PostgreSQL database (Vercel Postgres, Neon, Supabase, etc.)
2. Discord OAuth application credentials
3. The ISOBEL bot running separately (on a VPS, Docker, etc.)

### Environment Variables

Configure these in your Vercel project settings:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (pooled) |
| `DISCORD_CLIENT_ID` | Yes | Discord OAuth application client ID |
| `DISCORD_CLIENT_SECRET` | Yes | Discord OAuth application client secret |
| `NEXTAUTH_SECRET` | Yes | Random secret for NextAuth.js (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Yes | Your Vercel deployment URL (e.g., `https://your-app.vercel.app`) |
| `BOT_HEALTH_URL` | No | URL to bot's health endpoint for status checks |

### Deploy to Vercel

#### Option 1: Vercel CLI

```bash
cd web
npx vercel
```

#### Option 2: Git Integration

1. Push your code to GitHub/GitLab/Bitbucket
2. Import the project in Vercel dashboard
3. Set the root directory to `web`
4. Configure environment variables
5. Deploy

### Discord OAuth Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create or select your application
3. Go to OAuth2 settings
4. Add redirect URL: `${NEXTAUTH_URL}/api/auth/callback/discord` (example: `https://your-app.vercel.app/api/auth/callback/discord`)
5. Under OAuth2 scopes, enable `identify` and `guilds`
6. Copy Client ID and Client Secret to your environment variables
7. **Important**: Make sure `NEXTAUTH_URL` matches your deployment base URL (e.g., `https://your-app.vercel.app`)

### Database Setup

Run migrations after first deployment:

```bash
cd web
npm run db:push
```

Or use Drizzle Studio to manage your database:

```bash
npm run db:studio
```
