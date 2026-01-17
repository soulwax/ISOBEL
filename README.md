# ISOBEL

<div align="center">
  <img src=".github/songbird.png" width="600" alt="ISOBEL - A Discord Music Bot">
</div>



ISOBEL is a **highly-opinionated midwestern, now German claimed (same thing really), self-hosted** Discord music bot **that doesn't suck**. It's made for small to medium-sized Discord servers/guilds (think about a group the size of you, your friends, and your friend's friends).

The original author of the bot is [codetheweb](https://github.com/codetheweb) with the original code for [muse found here](https://github.com/museofficial/muse) and *I cannot thank him enough for the inspiration and foundation he laid.*

Thus I claim the same: This discord bot is one that doesn't suck.

There are a lot of changes made since Max Isom's original version.
First of all, this bot does not depend on YouTube or Spotify for music streaming. Instead, it uses its own music api, we just call it the *ominous music* **Songbird API**. 

Yes, it is more of a black box experience now than before, but with spotify and youtube being so unreliable for music streaming, this was the only way to go. Sorry Max. 
The second big change is that this bot is coming with its own web interface for configuration and settings management but this is work in progress. See [./web/README.md](./web/README.md).

**OTHERWISE**, ISOBEL works like before, you /play songs, /skip them, /pause, /resume, /seek, etc.

## Features

- 🎵 **High-Quality Audio**: 320kbps MP3 source with 192kbps Opus output for crystal-clear sound
- ⏹️ **Animated Progress Bar**: Real-time updating progress bars in Discord embeds
- 🎥 **Livestream Support**: Stream HLS live audio feeds
- ⏩ **Seeking**: Seek to any position within a song
- 💾 **Advanced Caching**: Local MP3 caching for instant playback and better performance
- 📋 **No Vote-to-Skip**: This is anarchy, not a democracy
- 🎶 **Starchild Music API**: Streams directly from the Starchild Music API (no YouTube or Spotify required)
- ↗️ **Custom Shortcuts**: Users can add custom shortcuts (aliases) for quick access
- 1️⃣ **One Song Per Command**: Predictable queue management - one song per `/play` command
- 🔄 **Smart Skipping**: Skip only works when more songs are queued - no errors at end of queue
- 🔊 **Volume Management**: Normalizes volume across tracks with automatic ducking when people speak
- ✍️ **TypeScript**: Written in TypeScript with full type safety, easily extendable
- ❤️ **Loyal Packers fan**

## Running

ISOBEL is written in TypeScript. You can either run ISOBEL with Docker (recommended) or directly with Node.js. Both methods require API keys passed in as environment variables.

### Environment Variables

Create a `.env` file in the project root with the following variables:

#### Required Variables

```env
DISCORD_TOKEN=your-discord-bot-token
STARCHILD_BASE_URL=https://your-api-url
STARCHILD_API_KEY=your-api's-key
```

- `DISCORD_TOKEN` - Your Discord bot token. Can be acquired [here](https://discordapp.com/developers/applications) by creating a 'New Application', then going to 'Bot'.
- `STARCHILD_BASE_URL` - The base URL for your Starchild Music API instance
- `STARCHILD_API_KEY` - Your Starchild Music API key. This unlocks streaming on the Starchild Music API. Create this key in your Starchild dashboard.

#### Optional Variables

```env
DATA_DIR=./data
CACHE_LIMIT=2GB

# SponsorBlock integration (optional)
# ENABLE_SPONSORBLOCK=true
# SPONSORBLOCK_TIMEOUT=5    # Delay (in minutes) before retrying when SponsorBlock servers are unreachable

# Bot status and activity (optional)
BOT_STATUS=online
# BOT_ACTIVITY_TYPE=LISTENING
# BOT_ACTIVITY_URL=
# BOT_ACTIVITY=music
```

- `DATA_DIR` - Directory for storing data files (defaults to `./data`)
- `CACHE_LIMIT` - Cache size limit (defaults to `2GB`, examples: `512MB`, `10GB`)
- `ENABLE_SPONSORBLOCK` - Set to `true` to enable SponsorBlock integration (defaults to `false`)
- `SPONSORBLOCK_TIMEOUT` - Delay (in minutes) before retrying when SponsorBlock servers are unreachable (defaults to `5`)
- `BOT_STATUS` - Bot presence status: `online`, `idle`, or `dnd` (defaults to `online`)
- `BOT_ACTIVITY_TYPE` - Activity type: `PLAYING`, `LISTENING`, `WATCHING`, or `STREAMING` (defaults to `LISTENING`)
- `BOT_ACTIVITY` - Activity text (defaults to `music`)
- `BOT_ACTIVITY_URL` - Required if using `STREAMING` activity type. A Twitch or YouTube stream URL.

**Complete `.env` example**:

```env
DISCORD_TOKEN=your-discord-bot-token-here
DATA_DIR=./data
STARCHILD_BASE_URL=https://your-api-url
STARCHILD_API_KEY=your-api's-key

############
# Optional #
############

CACHE_LIMIT=2GB

# ENABLE_SPONSORBLOCK=true
# SPONSORBLOCK_TIMEOUT=5    # Delay (in minutes) before retrying when SponsorBlock servers are unreachable

BOT_STATUS=online
# BOT_ACTIVITY_TYPE=LISTENING
# BOT_ACTIVITY_URL=
# BOT_ACTIVITY=music
```

ISOBEL will log a URL when run. Open this URL in a browser to invite ISOBEL to your server. ISOBEL will DM the server owner after it's added with setup instructions.

A 64-bit OS is required to run ISOBEL.

### Versioning

The `master` branch acts as the developing / bleeding edge branch and is not guaranteed to be stable.

When running a production instance, I recommend that you use the [latest release](https://github.com/soulwax/ISOBEL/releases/).

### 🐳 Docker

There are a variety of image tags available:
- `:2`: versions >= 2.0.0
- `:2.12`: versions >= 2.12.0 and < 2.13.0
- `:2.12.2`: an exact version specifier
- `:latest`: whatever the latest version is

**Basic Docker Run**:

```bash
docker run -it \
  -v "$(pwd)/data":/data \
  -e DISCORD_TOKEN='your-discord-token' \
  -e STARCHILD_API_KEY='your-starchild-api-key' \
  -e STARCHILD_BASE_URL='https://your-api-url' \
  ghcr.io/soulwax/ISOBEL:latest
```

This starts ISOBEL and creates a data directory in your current directory.

You can also store your tokens in an environment file and make it available to your container. By default, the container will look for a `/config` environment file. You can customize this path with the `ENV_FILE` environment variable to use with, for example, [docker secrets](https://docs.docker.com/engine/swarm/secrets/).

**Docker Compose**:

```yaml
services:
  isobel:
    image: ghcr.io/soulwax/ISOBEL:latest
    restart: always
    volumes:
      - ./data:/data
    environment:
      - DISCORD_TOKEN=your-discord-token
      - STARCHILD_API_KEY=your-api-key
      - STARCHILD_BASE_URL=your-api-url
      # Optional: Custom cache limit
      - CACHE_LIMIT=5GB
      # Optional: Bot status
      - BOT_STATUS=online
```

### Node.js

**Prerequisites**:
* Node.js (20.0.0 or later is required, latest 20.x.x LTS recommended)
* ffmpeg (4.1 or later)
* npm (comes with Node.js)

1. `git clone --recursive https://github.com/soulwax/ISOBEL.git && cd ISOBEL`
   - The `--recursive` flag is required to pull the web interface submodule located at `./web`
2. Copy `.env.example` to `.env` and populate with values:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```
3. I recommend checking out a tagged release with `git checkout v[latest release]`
4. Install dependencies: `npm install`
   - This will automatically initialize the web submodule and install its dependencies via the `postinstall` script
5. `npm run start`

**Note**: if you're on Windows, you may need to manually set the ffmpeg path. See [#345](https://github.com/soulwax/ISOBEL/issues/345) for details.

## ⚙️ Additional configuration (advanced)

### Cache

ISOBEL uses advanced local MP3 caching for optimal performance and sound quality. By default, ISOBEL limits the total cache size to around 2 GB. If you want to change this, set the environment variable `CACHE_LIMIT`. For example, `CACHE_LIMIT=512MB` or `CACHE_LIMIT=10GB`.

The cache stores high-quality MP3 files (320kbps) locally for instant playback, reducing API calls and ensuring consistent audio quality.

### Custom Bot Status

In the default state, ISOBEL has the status "Online" and the text "Listening to Music". You can change the status through environment variables:

- `BOT_STATUS`:
  - `online` (Online)
  - `idle` (Away)
  - `dnd` (Do not Disturb)

- `BOT_ACTIVITY_TYPE`:
  - `PLAYING` (Playing XYZ)
  - `LISTENING` (Listening to XYZ)
  - `WATCHING` (Watching XYZ)
  - `STREAMING` (Streaming XYZ)

- `BOT_ACTIVITY`: the text that follows the activity type

- `BOT_ACTIVITY_URL`: If you use `STREAMING` you MUST set this variable, otherwise it will not work! Here you write a regular YouTube or Twitch Stream URL.

#### Examples

**ISOBEL is watching a movie and is DND**:
```env
BOT_STATUS=dnd
BOT_ACTIVITY_TYPE=WATCHING
BOT_ACTIVITY=a movie
```

**ISOBEL is streaming Monstercat**:
```env
BOT_STATUS=online
BOT_ACTIVITY_TYPE=STREAMING
BOT_ACTIVITY_URL=https://www.twitch.tv/monstercat
BOT_ACTIVITY=Monstercat
```

**ISOBEL is in debugging mode**:
```env
BOT_STATUS=DEBUGGING
```

### SponsorBlock Integration

ISOBEL supports SponsorBlock integration to automatically skip non-music segments of tracks. To enable:

```env
ENABLE_SPONSORBLOCK=true
SPONSORBLOCK_TIMEOUT=5    # Delay (in minutes) before retrying when SponsorBlock servers are unreachable
```

### Automatic Volume Management

ISOBEL can automatically adjust volume when people speak in the voice channel:

- `/config set-reduce-vol-when-voice true` - Enable automatic volume reduction when people speak
- `/config set-reduce-vol-when-voice false` - Disable automatic volume reduction
- `/config set-reduce-vol-when-voice-target <volume>` - Set the target volume percentage when people speak (0-100, default is 70)

This feature ensures clear communication during conversations while maintaining music playback.

## 🎵 About Starchild Music API

ISOBEL uses the Starchild Music API for all music streaming and searching. This means:

- ✅ **No YouTube API keys required**
- ✅ **No Spotify credentials required**
- ✅ **Self-hosted or cloud-hosted API support**
- ✅ **High-quality audio streaming**
- ✅ **Fast and reliable search**

You'll need to set up your own Music API instance.

*My name Isobel*

*Married to myself*  
*My love Isobel*  
*Living by herself*

*In a heart full of dust*

*Lives a creature called lust*  
*It surprises and scares*  
*Like me, like me*

*My name Isobel*  
*Married to myself*  
*My love Isobel*  
*Living by herself*

## 🔧 Development

### Understanding the Two Parts of ISOBEL

ISOBEL is made up of **two separate projects** that work together:

1. **🤖 The Bot** (main project) - The Discord bot that plays music in voice channels
   - Located in the root directory (`/`)
   - Required to play music in Discord
   - Can work completely on its own without the web interface

2. **🌐 The Web Interface** (optional) - A website for managing bot settings
   - Located in the `./web` folder (git submodule)
   - **Optional** - the bot works fine without it
   - Provides a nice UI for changing settings instead of using Discord commands
   - Lets you manage favorites, volume settings, etc. through a web browser

**Think of it like this**: The bot is like a remote-controlled car. It works perfectly on its own. The web interface is like getting a smartphone app to control the car instead of using the physical remote. Nice to have, but not required!

### 🚀 Quick Start for Development

#### First-Time Setup (Both Projects)

```bash
# 1. Clone the repository with the web submodule
git clone --recursive https://github.com/soulwax/ISOBEL.git
cd ISOBEL

# 2. Install dependencies for BOTH projects
npm install
# This installs dependencies for the bot AND automatically installs the web dependencies

# 3. Set up your environment variables
cp .env.example .env
# Edit .env with your DISCORD_TOKEN, STARCHILD_BASE_URL, and STARCHILD_API_KEY
```

#### Development Mode - Choose Your Scenario

**Scenario A: I only want to work on the Discord bot** 🤖
```bash
npm run dev
```
- Starts only the bot with hot reload
- Perfect when you're adding new Discord commands, fixing playback issues, etc.
- The web interface won't be running (and that's okay!)

**Scenario B: I only want to work on the web interface** 🌐
```bash
npm run web:dev:all
```
- Starts only the web interface (both the Vite dev server and auth server)
- Good when you're designing new UI features, fixing web bugs
- The bot won't be running (you won't be able to test music playback)

**Scenario C: I want to work on BOTH at the same time** 🤖🌐
```bash
npm run dev:all
```
- Starts the bot AND the web interface together
- Recommended for full-stack development
- You can test how web changes affect the bot and vice versa
- Uses `concurrently` to run both processes in one terminal

### 📦 Building for Production

#### Build Scenarios

**Just build the bot:**
```bash
npm run build:bot
```
- Compiles TypeScript to JavaScript in the `dist/` folder
- Doesn't start anything - just builds

**Build everything (bot + web):**
```bash
npm run build:all
```
- Builds both the bot and web interface
- Doesn't start anything - just builds

**Build and start everything with PM2:**
```bash
npm run build
```
- Builds both projects
- Starts both with PM2 process manager (production mode)
- Use this when deploying to a server

### 🎯 Starting Services in Production

**Start only the bot:**
```bash
npm start
# OR
npm run pm2:start:prod
```

**Start only the web interface:**
```bash
npm run web:pm2:start:prod
```

**Start BOTH bot and web together:**
```bash
npm run start:all:prod
```
- This is what you want for a full production deployment

### 🛑 Stopping Services

**Stop only the bot:**
```bash
npm run pm2:stop
```

**Stop only the web:**
```bash
npm run web:pm2:stop
```

**Stop BOTH:**
```bash
npm run stop:all
```

### 🔄 Restarting Services

**Restart only the bot:**
```bash
npm run pm2:restart
```

**Restart BOTH:**
```bash
npm run restart:all
```

### 📊 Viewing Logs

**View bot logs:**
```bash
npm run pm2:logs
```

**View web logs:**
```bash
npm run web:pm2:logs:web      # Web server logs
npm run web:pm2:logs:auth     # Auth server logs
```

**View ALL logs (bot + web):**
```bash
npm run logs:all
```

### ✅ Quality Checks

**Lint (check code style):**
```bash
npm run lint              # Bot only
npm run lint:all          # Bot + Web
npm run lint:fix:all      # Auto-fix issues in both
```

**Type check (check TypeScript types):**
```bash
npm run typecheck         # Bot only
npm run typecheck:all     # Bot + Web
```

### 🆘 Common Issues

**"Web directory not found"**
- You forgot to clone with `--recursive` or the submodule isn't initialized
- Fix: `npm run submodule:init` or `git submodule update --init --recursive`

**PM2 processes won't start/stop**
- Processes might be stuck
- Fix: `npm run pm2:reset` (nukes everything and starts fresh)

**Changes not showing up**
- Make sure you're running in dev mode (`npm run dev` or `npm run dev:all`)
- Production builds need to be rebuilt after changes

### 📝 Summary Table

| What I want to do | Command to use |
|------------------|----------------|
| Work on bot only | `npm run dev` |
| Work on web only | `npm run web:dev:all` |
| Work on both | `npm run dev:all` |
| Deploy everything to production | `npm run build` then `npm run start:all:prod` |
| Deploy bot only | `npm run build:bot` then `npm start` |
| Stop everything | `npm run stop:all` |
| View all logs | `npm run logs:all` |
| Fix code style issues | `npm run lint:fix:all` |

## 📝 License

GPLv3 - see LICENSE file for details.
