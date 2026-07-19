# Stage 1: base image with build tools
FROM node:22-slim AS base
RUN corepack enable

# Stage 2: install all dependencies (including devDeps for build)
FROM base AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 3: build the Next.js app
FROM deps AS builder
WORKDIR /app
COPY . .
RUN pnpm run build

# Stage 4: production runtime
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3003

# Native build tools required by better-sqlite3 at install time
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install production dependencies only
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

# Retain python3 for Mastra skill sandbox execution
RUN apt-get update && apt-get install -y python3-pip && \
    pip3 install --no-cache-dir --break-system-packages mootdx requests pandas stockstats && \
    rm -rf /var/lib/apt/lists/*

# Clean up build tools (NOT python3 — skill sandbox needs it)
RUN apt-get purge -y make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Copy build output and static assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./

# Data directory for SQLite
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3003

CMD ["pnpm", "exec", "next", "start"]
