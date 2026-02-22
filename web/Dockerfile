# File: web/Dockerfile

# Web Interface Dockerfile
# Multi-stage build for the ISOBEL web interface

# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:24-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built application from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/scripts ./scripts

# Copy necessary config files
COPY tsconfig.json ./
COPY vite.config.ts ./

# Expose port
EXPOSE 3001

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Health check (using node instead of wget for Alpine)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the production server
CMD ["node", "scripts/serve-prod.js"]
