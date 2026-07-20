# Open Trading

A 股交易辅助面板（Next.js + 抖音雷达 + multi-agent）。

## 环境要求

- Node.js >= 22.13.0
- **pnpm**（仓库已固定；`packageManager` 字段 + `preinstall` 拦截 npm/yarn）

```bash
corepack enable
```

## 新 clone

```bash
pnpm install
pnpm setup          # .env / data/ / db:push
# 编辑 .env 填入 TikHub、newapi、讯飞 ASR 等密钥
pnpm dev            # http://localhost:3002
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发服务器（:3002） |
| `pnpm build` / `pnpm start` | 生产构建 / 启动（:3002） |
| `pnpm test` | 单测 |
| `pnpm lint` | ESLint |
| `pnpm setup` | 新环境数据目录 + schema |
| `pnpm db:push` | 仅推送 schema |
| `pnpm db:studio` | Drizzle Studio |
| `docker compose up -d` | 容器部署（端口 3002，挂载 `./data`） |

## Docker 部署要点

```bash
# 服务器上：准备 .env（至少 TikHub / NEWAPI / ASR；生产建议设 ADMIN_TOKEN）
cp .env.example .env   # 再编辑密钥
mkdir -p data          # 持久化目录；首次启动 entrypoint 会 drizzle-kit push --force

docker compose up -d --build
# 访问 http://<host>:3002
docker compose logs -f open-trading
```

- 镜像内已装 **ffmpeg**（转写抽音频）与 **python3 + mootdx 等**（skill 沙箱）。
- 数据卷 `./data` → `/app/data`（`douyin.db`、`mastra.db`、音视频、缓存）。
- **单实例**：转写/评判队列是进程内 runner，勿水平扩多个副本。
- 生产请关闭或慎用 `DOUYIN_CACHE_MODE=true`（开发回放缓存，会冻住扫描结果）。


更完整的架构说明见 [CLAUDE.md](./CLAUDE.md)。
