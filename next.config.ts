import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mastra 依赖 Node-only 模块，必须排除出打包
  serverExternalPackages: [
    "@mastra/*",
    "@mastra/core",
    "@mastra/libsql",
    "@mastra/loggers",
    "@mastra/observability",
    "bullmq",
    "ioredis",
    "express",
    "@bull-board/api",
    "@bull-board/ui",
    "@bull-board/express",
  ],
};

export default nextConfig;
