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
| `docker compose up -d --build` | 容器部署（端口 3002，挂载 `./data`） |

服务器部署步骤、环境变量与排障见 **[DEPLOY.md](./DEPLOY.md)**。

更完整的架构说明见 [CLAUDE.md](./CLAUDE.md)。
