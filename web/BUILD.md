# Build Configuration

## Build Output

The application builds to the `./build` directory (instead of the default `./dist`).

## Building for Production

1. **Build the application:**
   ```bash
   npm run build
   ```
   This will:
   - Compile TypeScript
   - Build optimized production assets
   - Output everything to `./build`

2. **Start with PM2 in production:**
   ```bash
   npm run pm2:start:prod
   ```
   This will automatically serve the optimized build from `./build` directory.

## Development vs Production

- **Development mode** (`NODE_ENV=development`):
  - Uses Vite dev server with hot module replacement
  - Serves from source files
  - Fast refresh enabled

- **Production mode** (`NODE_ENV=production`):
  - Serves optimized build from `./build` directory
  - Uses `vite preview` to serve static files
  - Minified and optimized assets

## PM2 Configuration

The PM2 ecosystem config automatically detects the environment:
- Development: Runs `npm run dev` (Vite dev server)
- Production: Runs `npm run preview` (serves from `./build`)

**Important:** Always run `npm run build` before starting PM2 in production mode.

## Git Ignore

The `./build` directory is excluded from git (see `.gitignore`).

## File Structure

```
ISOBEL-REACT/
├── build/              # Production build output (gitignored)
│   ├── index.html
│   ├── assets/
│   └── ...
├── src/                # Source files
├── scripts/
│   └── start-web.js    # PM2 wrapper script
└── ...
```
