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
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

# Native build tools for better-sqlite3; ffmpeg for ASR audio extract
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 生产依赖 + drizzle-kit/typescript（entrypoint 用 push 同步 schema，需能加载 schema.ts）
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod \
    && pnpm add drizzle-kit@0.31.10 typescript@5 --save-prod --no-lockfile \
    && pnpm store prune

# Retain python3 for Mastra skill sandbox execution
RUN apt-get update && apt-get install -y python3-pip && \
    pip3 install --no-cache-dir --break-system-packages mootdx requests pandas stockstats && \
    rm -rf /var/lib/apt/lists/*

# Clean up build tools (NOT python3 / ffmpeg — runtime needs them)
RUN apt-get purge -y make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Copy build output and static assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./

# Schema push 需要：drizzle 配置、迁移元数据、schema 源文件
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src/db ./src/db
COPY scripts/docker-entrypoint.mjs ./scripts/docker-entrypoint.mjs

# Data directory for SQLite / media / cache
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3002

ENTRYPOINT ["node", "scripts/docker-entrypoint.mjs"]
CMD ["pnpm", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3002"]
