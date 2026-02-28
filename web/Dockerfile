# File: web/Dockerfile

# Web Interface Dockerfile
# Multi-stage build for the ISOBEL web interface

# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.30.2 --activate

# Copy package files
COPY package.json ./

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Stage 2: Production
FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.30.2 --activate

# Install production dependencies
COPY package.json ./
RUN pnpm install --prod --no-frozen-lockfile

# Copy built frontend and server source (API + auth run in same process)
COPY --from=builder /app/build ./build
COPY --from=builder /app/src ./src

# Expose port
EXPOSE 3001

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Health check (using node instead of wget for Alpine)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Single process: API (including auth) + static frontend
CMD ["pnpm", "exec", "tsx", "src/server/serve.ts"]
