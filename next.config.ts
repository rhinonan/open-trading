import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mastra 依赖 Node-only 模块，必须排除出打包
  serverExternalPackages: [
    "@mastra/*",
    "@mastra/core",
    "@mastra/libsql",
    "@mastra/observability",
  ],
};

export default nextConfig;
