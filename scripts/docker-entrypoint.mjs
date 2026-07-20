#!/usr/bin/env node
/**
 * Docker 入口：
 * 1. 确保 data 目录存在
 * 2. 将业务库 schema 推到 data/douyin.db（drizzle-kit push --force，非交互）
 * 3. exec 下游 CMD（默认 next start）
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

function log(msg) {
  console.log(`[entrypoint] ${msg}`);
}

const dataRoot = process.env.DATA_ROOT || path.join(root, "data");
mkdirSync(dataRoot, { recursive: true });
log(`data root: ${dataRoot}`);

// drizzle.config.ts 固定读 ./data/douyin.db；若 DATA_ROOT 被改写，需与挂载一致
const dbPath = path.join(dataRoot, "douyin.db");
if (!existsSync(dbPath)) {
  log(`业务库尚不存在，将创建: ${dbPath}`);
}

// schema 同步：生产镜像若装了 drizzle-kit 则推送；失败不阻断启动（便于只读排查）
const hasDrizzleKit = existsSync(
  path.join(root, "node_modules", "drizzle-kit")
);
if (hasDrizzleKit) {
  log("推送 schema (drizzle-kit push --force)…");
  const push = spawnSync(
    "pnpm",
    ["exec", "drizzle-kit", "push", "--force"],
    {
      cwd: root,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    }
  );
  if (push.status !== 0) {
    console.error(
      `[entrypoint] schema push 失败 (exit ${push.status ?? "null"})，继续启动；请检查 data 卷与 drizzle 配置`
    );
  } else {
    log("schema 就绪");
  }
} else {
  log("未找到 drizzle-kit，跳过 schema push（请确保 data 卷已含最新表结构）");
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("[entrypoint] 缺少 CMD，例如: next start -H 0.0.0.0");
  process.exit(1);
}

log(`exec: ${args.join(" ")}`);
const child = spawn(args[0], args.slice(1), {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
