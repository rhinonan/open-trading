// src/queue/connection.ts
// Redis 连接适配层：业务代码禁止 new IORedis / 直连，一律经此模块。
import type { ConnectionOptions } from "bullmq";

/**
 * 默认本机 Redis；Docker Compose 内为 redis://redis:6379。
 */
export function getRedisUrl(): string {
  return (process.env.REDIS_URL || "redis://127.0.0.1:6379").trim();
}

/** 将 REDIS_URL 解析为 BullMQ/ioredis 连接选项 */
export function getConnectionOptions(): ConnectionOptions {
  const url = getRedisUrl();
  try {
    const u = new URL(url);
    const opts: ConnectionOptions = {
      host: u.hostname || "127.0.0.1",
      port: u.port ? Number(u.port) : 6379,
      maxRetriesPerRequest: null, // BullMQ Worker 要求
    };
    if (u.password) opts.password = decodeURIComponent(u.password);
    if (u.username && u.username !== "default") {
      opts.username = decodeURIComponent(u.username);
    }
    const dbMatch = u.pathname?.replace(/^\//, "");
    if (dbMatch && /^\d+$/.test(dbMatch)) {
      opts.db = Number(dbMatch);
    }
    return opts;
  } catch {
    return {
      host: "127.0.0.1",
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
}

export function isRedisConfigured(): boolean {
  const raw = process.env.REDIS_URL;
  if (raw !== undefined && raw.trim() === "") return false;
  return true;
}
