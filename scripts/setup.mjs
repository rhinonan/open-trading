#!/usr/bin/env node
/**
 * 新 clone / 新环境一键准备：
 * 1. 检查 Node 版本
 * 2. 若无 .env 则从 .env.example 复制
 * 3. 创建 data/（或 DATA_ROOT）
 * 4. drizzle-kit push 写入业务库 schema
 *
 * 用法（在仓库根目录）：
 *   pnpm setup
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

function log(msg) {
  console.log(`setup: ${msg}`);
}

function fail(msg, code = 1) {
  console.error(`setup: ${msg}`);
  process.exit(code);
}

// --- Node engines ---
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const engineRange = pkg.engines?.node; // e.g. ">=22.13.0"
const nodeVersion = process.versions.node;
if (engineRange) {
  const m = String(engineRange).match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (m) {
    const want = [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)];
    const got = nodeVersion.split(".").map((x) => Number(x));
    const ok =
      got[0] > want[0] ||
      (got[0] === want[0] && got[1] > want[1]) ||
      (got[0] === want[0] && got[1] === want[1] && got[2] >= want[2]);
    if (!ok) {
      fail(
        `Node ${nodeVersion} 不满足 engines.node (${engineRange})，请升级后重试`
      );
    }
  }
}
log(`Node ${nodeVersion} ok`);

// --- .env ---
const envPath = path.join(root, ".env");
const envExample = path.join(root, ".env.example");
if (!existsSync(envPath)) {
  if (!existsSync(envExample)) {
    fail("缺少 .env 且没有 .env.example，无法继续");
  }
  copyFileSync(envExample, envPath);
  log("已从 .env.example 创建 .env — 请填入 TIKHUB / NEWAPI / ASR 等密钥");
} else {
  log(".env 已存在，跳过复制");
}

// --- data root ---
// 与 src/lib/data-root.ts 一致：DATA_ROOT 优先，否则 <cwd>/data
const dataRoot = process.env.DATA_ROOT || path.join(root, "data");
mkdirSync(dataRoot, { recursive: true });
log(`数据目录就绪: ${dataRoot}`);

// --- schema ---
log("推送业务库 schema (drizzle-kit push --force)…");
// --force：非交互环境（CI/无 TTY）也能自动确认；本机有确认风险的大改仍应先看 generate 的 SQL
// Windows 下 npx/cmd 需要 shell；把整条命令当单字符串传入，避免 DEP0190
const push = spawnSync("npx drizzle-kit push --force", {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});
if (push.status !== 0) {
  fail(`db:push 失败 (exit ${push.status ?? "null"})`, push.status ?? 1);
}

log("完成。下一步：编辑 .env（若刚生成）后执行 pnpm dev");
