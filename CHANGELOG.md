# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.18.0] - 2026-02-07

### Fixed
- Improved Discord web authentication reliability by preventing frequent `/api/auth/session` and `/api/auth/csrf` checks from being rate-limited during login flows
- Fixed guild settings page layout alignment when the authenticated server sidebar is visible
- Fixed authenticated guild selection handling so server settings only render when the user is logged in
- Fixed guild settings fetch/update requests to consistently use the shared API base path

### Changed
- Increased auth endpoint rate limits to better support Discord OAuth callback/session traffic
- Updated server management UX so the left sidebar server list and per-server settings navigation behave more consistently

## [2.17.3] - 2026-01-22

### Fixed
- Fixed Docker container startup failure by replacing PM2 with direct Node execution
- Fixed Discord login functionality in web interface - login now properly redirects to Discord OAuth and back
- Fixed missing `DATABASE_URL` environment variable in docker-compose.yml
- Fixed Prisma client initialization to require `DATABASE_URL` and fail fast with clear error messages
- Fixed `migrate-and-start.ts` to properly handle PostgreSQL-only setup (removed SQLite fallback)

### Changed
- Updated Dockerfile to use `node` directly instead of `pm2-runtime` (Docker handles process management)
- Added `apt-utils` to Dockerfile to suppress debconf warnings during package installation
- Added `DEBIAN_FRONTEND=noninteractive` to Dockerfile for non-interactive package installation
- Updated Discord login signIn function to use `/api/auth/signin/discord` endpoint directly
- Updated Discord login callback URL to use full current page URL instead of just origin
- Added redirect callback to NextAuth config to properly handle post-login redirects using `NEXTAUTH_URL`
- Updated `migrate-and-start.ts` to require PostgreSQL and reject SQLite database URLs

## [2.17.2] - 2026-01-22

### Fixed
- Fixed Prisma client engine type error by adding PostgreSQL adapter support (`@prisma/adapter-pg`)
- Updated migration system to support PostgreSQL by updating `migration_lock.toml` provider
- Created baseline PostgreSQL migration to align with existing database schema
- Fixed `yarn prisma:migrate:deploy` command to work with PostgreSQL migrations

### Changed
- Added `@prisma/adapter-pg` and `pg` dependencies for PostgreSQL driver adapter support
- Updated Prisma client initialization to use PostgreSQL adapter instead of default engine
- Migration history now properly tracks PostgreSQL migrations alongside legacy SQLite migrations

## [2.17.1] - 2026-01-18

### Changed
- Docker now builds the bot without the web interface by default
- Added a separate `docker-compose.web.yml` for the web/auth services
- Updated health beacon port configuration and documentation
- Build process no longer starts services or installs web dependencies by default
- Updated Docker runtime to include `package.json` for banner/logging
- Docker image now starts the bot with `pm2-runtime` for automatic restarts
- Added yt-dlp and Python to the runtime image for YouTube fallback playback
- Improved search responsiveness by probing HLS streams with a short timeout and running API search in parallel
- Added search retries with backoff for transient Starchild API failures
- Added MP3 cache prefetching and shared in-flight downloads to reduce playback gaps
- Reused audio players across plays to reduce setup overhead
- Streamed directly from Starchild while caching in the background when no seek is needed
- Prevented duplicate idle listeners on the audio player
- Added voice reconnect attempts with backoff after disconnects
- Added ffmpeg start retries for transient stream failures
- Increased audio player missed-frame tolerance to reduce dropouts
- Added audio player error retries with backoff before skipping
- Preloaded next-track stream paths after caching completes
- Added YouTube link parsing with oEmbed title lookup to search Starchild
- Added yt-dlp fallback for YouTube links when Starchild has no match
- Added support for playing mp3 attachments uploaded to Discord
- Added `/yt` command to play YouTube URLs or search terms via yt-dlp
- Added playback buttons (pause/resume, next) to the Now Playing message
- Added previous and stop buttons to the Now Playing controls
- Added AI suggestion dropdown using Songbird Next API (`SONGBIRD_NEXT_URL`)
- Added search modal button on Now Playing controls
- Added Prisma 7 config file and moved datasource URL out of `schema.prisma`
- Switched Prisma datasource provider to PostgreSQL (requires `DATABASE_URL` environment variable)
- Updated Docker documentation to reflect PostgreSQL requirement and new environment variables

## [2.17.0] - 2026-01-17

### Changed - Repository Unification

**ISOBEL is now a single unified repository** - the web interface has been integrated as a first-class directory instead of a git submodule.

#### Repository Structure
- **Removed git submodule**: Deinitialized and removed the ECHO-Web git submodule that was previously at `./web`
- **Integrated web interface**: Moved the standalone ISOBEL-REACT project into `./web/` as a regular directory
- **Single repository**: The web interface is now tracked as part of the main ISOBEL repository (no separate repos to manage)
- **Updated .gitmodules**: Removed all submodule references (file is now empty)
- **Updated .gitignore**: Removed `web` directory exclusions to properly track the web interface
- **Renamed from ECHO to ISOBEL**: Updated all references in web interface from "ECHO" to "ISOBEL" for consistent branding

#### Build & Deployment Integration
- **Unified build process**: `npm run build` now builds both bot and web interface, then automatically starts both services via PM2
- **Separated build commands**:
  - `npm run build` - Builds both projects and starts them (production workflow)
  - `npm run build:bot` - Build only the bot
  - `npm run build:all` - Build both without starting services
- **Automatic startup**: Added `postbuild` hook that runs `start:all:prod` to launch both services
- **Coordinated PM2 management**: Bot and web interface now start/stop/restart together via unified commands

#### Development Workflow
- **Unified development mode**: Added `npm run dev:all` to run both bot and web interface simultaneously using `concurrently`
  - Bot runs on its standard ports with `tsx watch`
  - Web interface runs Vite dev server (port 3001) + auth server (port 3003)
  - Colored console output (blue for bot, cyan for web) for easy distinction
- **Individual development modes**:
  - `npm run dev` - Bot only (development mode)
  - `npm run web:dev` - Web Vite server only
  - `npm run web:dev:all` - Web Vite + auth server
  - `npm run dev:all` - Both together (recommended for full-stack development)

#### Package Management
- **Added concurrently**: Installed `concurrently@^9.2.1` as dev dependency for running parallel development processes
- **Streamlined postinstall**: Updated `postinstall` script to install web dependencies without submodule initialization
- **Removed submodule scripts**: Cleaned up `submodule:init`, `submodule:update`, and `submodule:status` scripts (no longer needed)
- **Updated error messages**: Replaced all "Web submodule not found" messages with "Web directory not found"

#### Web Interface Features (Integrated)
The web interface now includes all features from the previous standalone ISOBEL-REACT project:

**Architecture & Technologies**:
- React 19 with TypeScript
- Vite 7.3 for fast builds and development
- PostgreSQL database (via Drizzle ORM) replacing SQLite
- Discord OAuth authentication (NextAuth v5)
- Express.js backend with security middleware (helmet, rate-limiting)
- Winston logging for production debugging
- PM2 process management for production deployments

**Security & Production Features**:
- Helmet.js security headers
- Express rate limiting (protects against abuse)
- Environment-based configuration with Zod validation
- Separate development and production modes
- Comprehensive error handling and logging
- CORS configuration support

**UI Components**:
- Modern landing page with Discord-inspired design
- Discord guild (server) sidebar for easy navigation
- Per-guild settings management interface
- Health indicator showing bot and API status
- Discord login/logout functionality
- Fully responsive mobile-first design

**Deployment Options**:
- Vercel deployment configuration included
- PM2 ecosystem configuration for self-hosting
- Environment-specific startup scripts
- Database migration scripts

#### Documentation Updates
- **README.md**:
  - Removed all git submodule instructions
  - Updated development section with new unified workflow
  - Added "Building and Deploying" section documenting new build process
  - Updated web interface scripts documentation
  - Removed `--recursive` flag from clone instructions (no longer needed)
- **Web branding**: Updated all web interface files to use "ISOBEL" instead of "ECHO"
  - `web/package.json` - Updated description
  - `web/README.md` - Updated title and description
  - `web/index.html` - Updated page title
  - `web/src/App.tsx` - Updated GitHub link
  - `web/CLAUDE.md` - Updated project description
  - `web/CHANGELOG.md` - Updated project name

#### Migration Impact
- **No breaking changes for users**: The bot functionality remains unchanged
- **Simplified development**: Contributors no longer need to manage git submodules
- **Cleaner repository**: Everything in one place, easier to clone and develop
- **Better integration**: Bot and web interface can be developed, built, and deployed together
- **Improved startup**: Running `npm run build` now handles everything automatically

### Added

- Added `dev:all` script for unified development of bot and web interface
- Added `web:dev:all` script wrapper for web interface development (Vite + auth server)
- Added `build:bot` script to build only the bot
- Added `build:all` script to build both projects without starting services
- Added `concurrently` dependency for parallel process management

### Removed

- Removed git submodule configuration and references
- Removed submodule management scripts (`submodule:init`, `submodule:update`, `submodule:status`)
- Removed ISOBEL-REACT as separate standalone project

## [2.16.0] - 2026-01-14

### Security
- **API Key Security**: Moved Starchild API key from URL query parameters to HTTP headers (`X-API-Key`) to prevent exposure in logs and referrer headers
- **SSRF Protection**: Added validation to block localhost and internal IP addresses in HLS stream URLs to prevent Server-Side Request Forgery attacks
- **Path Traversal Protection**: Added hash validation in file cache to prevent path traversal attacks
- **CORS Security**: Made health server CORS configurable via `HEALTH_CORS_ORIGINS` environment variable (defaults to allow all for backward compatibility)
- **Rate Limiting**: Implemented rate limiting on health server endpoint (10 requests per 60 seconds per IP)

### Fixed
- Fixed `SPONSORBLOCK_TIMEOUT` configuration bug - now correctly reads from `SPONSORBLOCK_TIMEOUT` environment variable instead of `ENABLE_SPONSORBLOCK`
- Fixed JSON parsing error handling in key-value cache - corrupted cache entries are now automatically deleted and recomputed
- Fixed memory leak where player instances were never cleaned up when bot left a guild
- Fixed N+1 database query problem in file cache orphan removal - now batches queries for better performance
- Fixed eviction loop inefficiency - now tracks total cache size incrementally instead of recalculating after each eviction
- Fixed unsafe type assertions in file cache iterator
- Fixed missing null checks and validation in `addToQueue` method
- Fixed config display bug - now correctly shows `queueAddResponseEphemeral` setting instead of wrong field
- Fixed `shouldSplitChapters` parameter being declared but not destructured in `addToQueue` method (feature not yet implemented)
- Fixed error handling in `get-songs.ts` - validation failures (invalid protocol, SSRF-blocked URLs) now properly fall through to API search instead of crashing the function
- Fixed memory leak in health server - cleanup interval is now properly stored and cleared when server stops or restarts
- Fixed TypeScript build error - removed impossible length check on voice channels tuple (always length 2)

### Changed
- Improved error handling for async void functions in player service with new `safeAsync()` helper method
- Enhanced URL validation in `get-songs.ts` with protocol validation and SSRF protection - invalid URLs now gracefully fall back to search instead of throwing errors
- Added proper error logging for unexpected errors during URL parsing and HLS stream checking
- Added Prisma connection management with graceful shutdown handlers and development logging
- Optimized file cache cleanup to use batch operations instead of per-file database queries

### Performance
- Optimized file cache eviction to avoid recalculating total size after each file deletion
- Reduced database queries in orphan file cleanup from O(n) to O(1)
- Added automatic cleanup of player instances on guild leave to prevent memory leaks
- Fixed memory leak in health server rate limit cleanup interval

## [2.15.0] - 2025-12-02

### Added

-**More elegant solution to the web interface**
- Turning it into a submodule and adding it to the package.json
- Adding unified scripts for linting, type checking, and building both the bot and web interface
- Update README.md to inform about the submodule and web interface


## [2.14.0] - 2025-12-02

### Added

- **Web Interface**: New React-based web interface and landing page for ISOBEL
  - Modern, professional react application for now just flexing bot features
  - Fully responsive design with Discord-inspired color scheme
  - Built with React 19, TypeScript, and Vite
  - Section highlighting all bot capabilities
  - Hero section with Discord mockup visualization
  - About section with statistics and information
  - Available as of this version at https://echo.soulwax.dev

## [2.13.0] - 2025-12-02

### Changed

- Improved guild join message to better reflect bot capabilities and added homepage URL (https://echo.soulwax.dev)

## [2.12.4] - 2025-12-02

### Fixed

- Fixed malformed comment block in ecosystem.config.cjs that caused build errors with PM2

### Changed

- HENCEFORTH: This codebase is GPL3 licensed, and all contributions must be GPL3 licensed

## [2.12.3] - 2025-12-02

### Fixed

- Fixed TypeScript linting errors across the codebase:
  - Replaced ternary operator with nullish coalescing operator in config.ts
  - Fixed promise return type in file-cache.ts event handler
  - Removed unused error variable in file-cache.ts catch block
  - Fixed template literal type error in player.ts by properly converting unknown error to string
  - Replaced `any` types with `unknown`/`never` in key-value-cache.ts for better type safety
  - Changed `Array<T>` to `T[]` syntax in register-commands-on-guild.ts
  - Fixed unsafe `any` type assertion in favorites.ts using `@ts-expect-error` for type resolution mismatch

## [2.12.2] - 2025-12-02

### Fixed

- Fixed TypeScript build error with hasha import (changed from default to named export `hashSync`)
- Fixed TypeScript build error with parse-duration null check in duration-string-to-seconds utility

### Changed

- Updated Dockerfile to use npm instead of yarn for package management
- Updated Dockerfile to use package-lock.json instead of yarn.lock
- Improved Dockerfile structure to properly include Prisma CLI and migrations for runtime
- Modernized Dockerfile build process with better multi-stage optimization
- Removed youtube and spotify .env entries

## [2.12.1] - 2025-11-27

### Fixed

- Fixed Typescript type errors, and increase type safety across the entire codebase
- Fix linting and formatting, overhaul husky, apply dependabot suggestions, fix breaking changes coming with those
- Fix build errors, and improve build process massively

### Changed

- The changes made with 2.12.1 are massive and should be considered a complete rewrite of the bot
- Complete overhaul of the entire codebase, moving away from the youtube and spotify api
- Update dependencies and fix breaking changes caused by them
- Use a self-written api for music streaming and searching called starchild-api
- Remove all dependencies on youtube and spotify, now only using starchild-api for music streaming and searching
- Massively improve music suggestion speed and accuracy
- Massively improve music streaming and audio quality

## [2.11.1] - 2025-04-07

- Revert Dockerfile to inherit dependencies image from base image

## [2.11.0] - 2025-03-31

- Updated ytdl-core to 4.16.5 distubejs/ytdl-core@4.15.9...4.16.6 which includes distubejs/ytdl-core@1f57d78 fixing the sig parsing
- ytdl-core dropped node 18 support distubejs/ytdl-core@60f0ab1 so updated to latest Node LTS 22
- Updated to @discordjs/opus v0.10.0 for Node 22 support
- Updated to @discordjs/voice v0.18.0 to remove support for depricated encryption <https://github.com/discordjs/discord.js/releases/tag/%40discordjs%2Fvoice%400.18.0>

## [2.10.1] - 2025-01-28

- Remove Spotify requirement
- Dependency update

## [2.10.0] - 2024-11-04
- New `/config set-reduce-vol-when-voice` command to automatically turn down the volume when people are speaking in the channel
- New `/config set-reduce-vol-when-voice-target` command to set the target volume percentage (0-100) when people are speaking in the channel
- Support for using only YouTube, spotify credentials are now optional.
- Dependency update (Additional downgrade for p-queue)

## [2.9.5] - 2024-10-29
- Dependency update
- Pull request #1040 merged (Used incorrect PR number, apoligies)

## [2.9.4] - 2024-08-28

### Added

- An optional `page-size` to `/queue` command
- Add `default-queue-page-size` setting

## [2.9.3] - 2024-08-19

### Fixed

- bumped @discordjs/voice
- bumped @distube/ytdl-core
 source if you use Docker**.

## [2.9.1] - 2024-08-04

### Fixed

- bumped ytdl-core

## [2.9.0] - 2024-07-17

### Added

- A `skip` option to the `/play` command

### Fixed

- Fixed playback issue
- Audioplayer not stopping properly

## [2.8.1] - 2024-04-28

### Fixed

- Fixed import issue that broke ISOBEL inside of Docker. Thanks @sonroyaalmerol!

## [2.8.0] - 2024-04-28

### Added

- SponsorBlock is now supported as an opt-in feature and will skip non-music segments of videos when possible. Check the readme for config details. Thanks @Charlignon!
- There's a new config setting to make ISOBEL responses when adding items to the queue visible only to the requester. Thanks @Sheeley7!

## [2.7.1] - 2024-03-18

### Changed
- Reduced Docker image size

## [2.7.0] - 2024-03-12

### Added 🔊
- A `/volume` command is now available.
- Set the default volume with `/config set-default-volume`

## [2.6.0] - 2024-03-03

### Added

- ISOBEL can now auto-announce new tracks in your voice channel on the transition of a new track. Use `/config set-auto-announce-next-song True` to enable.

## [2.5.0] - 2024-01-16

### Added
- Added `/loop-queue`

## [2.4.4] - 2023-12-21

- Optimized Docker container to run JS code directly with node instead of yarn, npm and tsx. Reduces memory usage.

## [2.4.3] - 2023-09-10

### Fixed

- Switched ytdl-core to patched version

## [2.4.2] - 2023-08-12

### Fixed

- Bumped node-ytsr ([#948](https://github.com/soulwax/ECHO/issues/948))

## [2.4.1] - 2023-07-23

### Fixed
- Autocomplete suggestion search for `favorites use` command is no longer case-sensitive
- Autocomplete suggestion results for `favorites use` could return >25 results which Discord's API does not support

## [2.4.0] - 2023-07-19

### Added

- Pagination to the output of the `favorites list` command

### Fixed

- Favorites list exceeding Discord's size limit could not be
  viewed ([#606](https://github.com/soulwax/ECHO/issues/606))

## [2.3.1] - 2023-07-18

### Fixed

- Bumped ytdl-core

## [2.3.0] - 2023-05-13

### Added

- ISOBEL now normalizes playback volume across tracks. Thanks to @UniversalSuperBox for sponsoring this feature!

### Fixed

- Fixed a bug where tracks wouldn't be cached

## [2.2.4] - 2023-04-17

### Fixed

- Bumped ytdl-core

## [2.2.3] - 2023-04-04

- Updated ytsr dependency to fix (reading 'reelPlayerHeaderRenderer') error

## [2.2.2] - 2023-03-18

### Changed

- Removed youtube.ts package

## [2.2.1] - 2023-03-04

### Fixed

- Fixed all lint errors
- Create the guild settings when not found instead of returning an error
- Add temporary workaround to avoid VoiceConnection being stuck in signalling state

## [2.2.0] - 2023-02-26

### Added

- Added a '/replay' to restart the current song. Alias for '/seek time: 0'

## [2.1.9] - 2023-02-14

### Fixed

- Queueing a YouTube playlist sometimes resulted in an infinite loop

## [2.1.8] - 2023-02-09

### Changed

- Minor message improvements

## [2.1.7] - 2022-09-19

### Fixed

- Bumped ytdl-core

## [2.1.6] - 2022-08-26

### Changed

- Now uses the `slim` variant of the official Node image to reduce image size by ~300 MB

## [2.1.5] - 2022-08-26

### Fixed

- Bumped ytdl-core

## [2.1.4] - 2022-08-19

### Fixed

- Switch from emso to [tsx](https://github.com/esbuild-kit/tsx) to fix ESM loader bug with recent Node.js versions

## [2.1.3] - 2022-08-08

### Fixed

- Cache files are now correctly created

## [2.1.2] - 2022-08-04

### Fixed

- Bot status is working again

### Changed

- Bumped dependencies

## [2.1.1] - 2022-07-16

### Fixed

- Retry refreshing Spotify access token if a request fails (should fix <https://github.com/soulwax/ECHO/issues/719>)

## [2.1.0] - 2022-06-25

- `/loop` command that plays the current song on loop

## [2.0.4] - 2022-05-16

### Fixed

- Bad import

## [2.0.3] - 2022-05-15

### Changed

- Bumped dependencies
- Add tini to Docker image to reap zombie processes

## [2.0.2] - 2022-05-14

### Changed

- Fully remove `/config set-role`

## [2.0.1] - 2022-05-13

### Changed

- Fixed message sent on guild invite to better reflect new permission system

## [2.0.0] - 2022-05-13

### Changed

- Migrated to the v10 API
- Command permissions are now configured differently: you can now configure permissions in Discord's UI rather than through the bot. See the [wiki page](https://github.com/soulwax/ECHO/wiki/Configuring-Bot-Permissions) for details.
- 🚨 when you upgrade to this version, the role you manually set with `/config set-role` will no longer be respected. Check the above link for how to re-configure permissions.

## [1.9.0] - 2022-04-23

### Changed

- `/move` command now shows the track that was moved and its position

### Fixed

- Fixed a case-sensitive import issue

### Added

- Added a `/next` alias for `/skip`

## [1.8.2] - 2022-03-27

### Fixed

- `/fseek` now works again

## [1.8.1] - 2022-03-26

### Changed

- Reduced image size

## [1.8.0] - 2022-03-24

### Added

- Added a configurable bot status with user defined activities

### Fixed

- Error messages consistently show as `🚫 ope: error`

## [1.7.0] - 2022-03-19

### Added

- Added a `/move` command to change position of tracks
- Added a `/now-playing` command to show the current track without the full queue embed

## [1.6.2] - 2022-03-17

### Fixed

- There are no longer FFMPEG orphan processes after listening to a livestream

## [1.6.1] - 2022-03-15

### Fixed

- The duration of live YouTube streams is now correctly formatted again
- Queueing massive YouTube playlists (4000+ tracks) now works

## [1.6.0] - 2022-03-13

### Changed

- Now uses [esmo](https://github.com/antfu/esno) so we don't have to build
- `/seek` and `/fseek` can now be given duration strings. For example, `1m` and `2m 15s` work. If the input consists only of numbers, ISOBEL will treat it as the number of seconds to advance (backwards-compatible behavior).

## [1.5.0] - 2022-03-12

### Changed

- ISOBEL will now allow the member who invited ISOBEL to set config options. For this to work, the View Audit Logs permission must be given when inviting ISOBEL. If it isn't given, ISOBEL still works and will contact the owner instead for initial setup.

## [1.4.1] - 2022-03-12s

### Changed

- Bumped dependencies (really just wanted to test some workflows :))

## [1.4.0] - 2022-03-12

### Added

- ISOBEL can now HTTP stream live audio files (see #396)

## [1.3.0] - 2022-03-09

### Added

- `/play` has a new `split` option that will split queued YouTube videos into chapters, if the video has them
- `/resume` command to resume playback

### Changed

- `query` is now a required parameter from `/play`

### Removed

- `/play` cannot resume the playback anymore since `query` is now required

## [1.2.0] - 2022-02-24

### Added

- `/stop` command to disconnect and clear the queue

## [1.1.2] - 2022-02-21

### Changed

- Bumped dependencies

## [1.1.1] - 2022-02-12

### Fixed

- `/config set-wait-after-queue-empties` now works (fixed typo)

## [1.1.0] - 2022-02-11

### Changed

- ISOBEL now stays in a voice channel after the queue finishes for 30 seconds by default. This behavior can be changed with `/config set-wait-after-queue-empties`.

## [1.0.0] - 2022-02-05

### Changed

- Migrated to [Slash Commands](https://support.discord.com/hc/en-us/articles/1500000368501-Slash-Commands-FAQ)
- Upgrading **will cause unavoidable data loss**. Because slash commands work differently, **all shortcuts will be lost**. Functionality similar to shortcuts is provided by the `/favorites` command.
- Because slash commands require different permissions, **you must kick ISOBEL and re-add ISOBEL to your server** before you can use the bot.

## [0.5.4] - 2022-02-01

### Fixed

- Prisma no longer causes a crash when running on Windows

## [0.5.3] - 2022-02-01

### Changed

- Environment variable values are now trimmed (whitespace is removed)

## [0.5.2] - 2022-01-29

### Fixed

- Playing livestreams now works again

## [0.5.1] - 2022-01-25

### Fixed

- Queueing Spotify playlists could sometimes fail when a song wasn't found on YouTube

## [0.5.0] - 2022-01-21

### Changed

- Queue embeds are now more detailed and appear when resuming playback. Thanks @bokherus!

## [0.4.0] - 2022-01-17

### Added

- Playlists can now be shuffled as they are added to the queue, using the `shuffle` option to `play`.

## [0.3.2] - 2022-01-17

### Fixed

- The SQLite database path is now correctly generated on Windows

### Changed

- Track lookups no longer fail silently (error is returned and logged)

## [0.3.1] - 2022-01-06

### Fixed

- Prisma client and migrations are no longer broken in built Docker images

## [0.3.0] - 2022-01-05

### Changed

- Migrated from Sequelize to Prisma. (#456)
- Bumped dependencies

## [0.2.1] - 2021-12-18

### Added

- [release-it](https://www.npmjs.com/package/release-it): makes it easier to generate new tags and releases

## [0.2.0]

### Added

- A custom track limit can now be set when queueing playlists from Spotify (default stays at 50). See #370.

## [0.1.1]

### Fixed

- Fixes a race condition in the file cache service (see #420)

## [0.1.0]

### Added

- Initial release

[unreleased]: https://github.com/ECHO official/ECHO /compare/v2.11.1...HEAD
[2.11.1]: https://github.com/ECHO official/ECHO /compare/v2.11.0...v2.11.1
[2.11.0]: https://github.com/ECHO official/ECHO /compare/v2.10.1...v2.11.0
[2.10.1]: https://github.com/ECHO official/ECHO /compare/v2.10.0...v2.10.1
[2.10.0]: https://github.com/ECHO official/ECHO /compare/v2.9.5...v2.10.0
[2.9.5]: https://github.com/ECHO official/ECHO /compare/v2.9.4...v2.9.5
[2.9.4]: https://github.com/soulwax/ECHO/compare/v2.9.3...v2.9.4
[2.9.3]: https://github.com/soulwax/ECHO/compare/v2.9.2...v2.9.3
[2.9.1]: https://github.com/soulwax/ECHO/compare/v2.9.0...v2.9.1
[2.9.0]: https://github.com/soulwax/ECHO/compare/v2.8.1...v2.9.0
[2.8.1]: https://github.com/soulwax/ECHO/compare/v2.8.0...v2.8.1
[2.8.0]: https://github.com/soulwax/ECHO/compare/v2.7.1...v2.8.0
[2.7.1]: https://github.com/soulwax/ECHO/compare/v2.7.0...v2.7.1
[2.7.0]: https://github.com/soulwax/ECHO/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/soulwax/ECHO/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/soulwax/ECHO/compare/v2.4.4...v2.5.0
[2.4.4]: https://github.com/soulwax/ECHO/compare/v2.4.3...v2.4.4
[2.4.3]: https://github.com/soulwax/ECHO/compare/v2.4.2...v2.4.3
[2.4.2]: https://github.com/soulwax/ECHO/compare/v2.4.1...v2.4.2
[2.4.1]: https://github.com/soulwax/ECHO/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/soulwax/ECHO/compare/v2.3.1...v2.4.0
[2.3.1]: https://github.com/soulwax/ECHO/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/soulwax/ECHO/compare/v2.2.4...v2.3.0
[2.2.4]: https://github.com/soulwax/ECHO/compare/v2.2.3...v2.2.4
[2.2.3]: https://github.com/soulwax/ECHO/compare/v2.2.2...v2.2.3
[2.2.2]: https://github.com/soulwax/ECHO/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/soulwax/ECHO/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/soulwax/ECHO/compare/v2.1.9...v2.2.0
[2.1.9]: https://github.com/soulwax/ECHO/compare/v2.1.8...v2.1.9
[2.1.8]: https://github.com/soulwax/ECHO/compare/v2.1.7...v2.1.8
[2.1.7]: https://github.com/soulwax/ECHO/compare/v2.1.6...v2.1.7
[2.1.6]: https://github.com/soulwax/ECHO/compare/v2.1.5...v2.1.6
[2.1.5]: https://github.com/soulwax/ECHO/compare/v2.1.4...v2.1.5
[2.1.4]: https://github.com/soulwax/ECHO/compare/v2.1.3...v2.1.4
[2.1.3]: https://github.com/soulwax/ECHO/compare/v2.1.2...v2.1.3
[2.1.2]: https://github.com/soulwax/ECHO/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/soulwax/ECHO/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/soulwax/ECHO/compare/v2.0.4...v2.1.0
[2.0.4]: https://github.com/soulwax/ECHO/compare/v2.0.3...v2.0.4
[2.0.3]: https://github.com/soulwax/ECHO/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/soulwax/ECHO/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/soulwax/ECHO/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/soulwax/ECHO/compare/v1.9.0...v2.0.0
[1.9.0]: https://github.com/soulwax/ECHO/compare/v1.8.2...v1.9.0
[1.8.2]: https://github.com/soulwax/ECHO/compare/v1.8.1...v1.8.2
[1.8.1]: https://github.com/soulwax/ECHO/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/soulwax/ECHO/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/soulwax/ECHO/compare/v1.6.2...v1.7.0
[1.6.2]: https://github.com/soulwax/ECHO/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/soulwax/ECHO/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/soulwax/ECHO/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/soulwax/ECHO/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/soulwax/ECHO/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/soulwax/ECHO/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/soulwax/ECHO/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/soulwax/ECHO/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/soulwax/ECHO/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/soulwax/ECHO/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/soulwax/ECHO/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/soulwax/ECHO/compare/v0.5.4...v1.0.0
[0.5.4]: https://github.com/soulwax/ECHO/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/soulwax/ECHO/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/soulwax/ECHO/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/soulwax/ECHO/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/soulwax/ECHO/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/soulwax/ECHO/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/soulwax/ECHO/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/soulwax/ECHO/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/soulwax/ECHO/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/soulwax/ECHO/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/soulwax/ECHO/releases/tag/v0.2.0
[0.1.1]: https://github.com/soulwax/ECHO/releases/tag/v0.1.1
[0.1.0]: https://github.com/soulwax/ECHO/releases/tag/v0.1.0
