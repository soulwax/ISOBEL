# File: Dockerfile

FROM node:24-bookworm-slim AS base

# openssl will be a required package if base is updated to 18.16+ due to node:*-slim base distro change
# https://github.com/prisma/prisma/issues/19729#issuecomment-1591270599
# Install apt-utils early to suppress debconf warnings, then install runtime dependencies
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
    apt-utils \
    ffmpeg \
    yt-dlp \
    python3 \
    python-is-python3 \
    tini \
    openssl \
    ca-certificates \
    && apt-get autoclean \
    && apt-get autoremove \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
FROM base AS dependencies

WORKDIR /usr/app

# Add Python and build tools to compile native modules
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
    apt-utils \
    ffmpeg \
    yt-dlp \
    python3 \
    python-is-python3 \
    build-essential \
    && apt-get autoclean \
    && apt-get autoremove \
    && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock ./

# Install full (dev + prod) deps for build stage
RUN yarn install --frozen-lockfile

# Create a production-only node_modules tree for runtime
FROM dependencies AS prod-deps
RUN yarn install --production --frozen-lockfile
RUN cp -R node_modules /usr/app/prod_node_modules

FROM dependencies AS builder

COPY . .

# Run tsc build
RUN yarn prisma:generate
RUN yarn build:bot

# Only keep what's necessary to run
FROM base AS runner

WORKDIR /usr/app

# Copy built application
COPY --from=builder /usr/app/dist ./dist
# Copy production dependencies
COPY --from=prod-deps /usr/app/prod_node_modules ./node_modules
# Copy Prisma client (needed at runtime)
COPY --from=builder /usr/app/node_modules/.prisma/client ./node_modules/.prisma/client
# Copy Prisma CLI (needed for migrations at runtime)
# Create .bin directory first, then copy prisma package and binary
RUN mkdir -p ./node_modules/.bin
COPY --from=builder /usr/app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /usr/app/node_modules/.bin/prisma ./node_modules/.bin/prisma
# Copy Prisma schema, config, and migrations (needed for migrate deploy)
COPY --from=builder /usr/app/schema.prisma ./schema.prisma
COPY --from=builder /usr/app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /usr/app/migrations ./migrations
COPY --from=builder /usr/app/package.json ./package.json
COPY --from=builder /usr/app/ecosystem.config.cjs ./ecosystem.config.cjs

# Create data directory
RUN mkdir -p /data

ARG COMMIT_HASH=unknown
ARG BUILD_DATE=unknown

ENV DATA_DIR=/data
ENV NODE_ENV=production
ENV COMMIT_HASH=$COMMIT_HASH
ENV BUILD_DATE=$BUILD_DATE
ENV ENV_FILE=/config

# Use tini as entrypoint for proper signal handling
ENTRYPOINT ["tini", "--"]

# Run the migrate-and-start script directly with node
# Docker handles process management, so PM2 is not needed
CMD ["node", "--enable-source-maps", "dist/scripts/migrate-and-start.js"]
