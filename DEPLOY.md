# 服务器部署指南（Docker）

Open Trading 当前以 **单容器 + 挂载数据卷** 部署。默认对外端口 **3002**。

## 1. 前置条件

| 项 | 说明 |
|----|------|
| 主机 | Linux 推荐；已装 Docker Engine + Compose 插件 |
| 资源 | 建议 ≥ 2 CPU、4GB 内存（compose 默认限 2 CPU / 2GB，可按需改） |
| 出网 | 需访问 TikHub、newapi（LLM 网关）、讯飞 ASR |
| 端口 | 主机 `3002` 空闲（或改 compose 端口映射） |

**不要水平扩多个副本**：转写 / 评判队列是进程内 runner，多实例会抢任务、状态不一致。

## 2. 获取代码

```bash
git clone <你的仓库 URL> open-trading
cd open-trading
# 或已有目录：git pull
```

## 3. 配置 `.env`

```bash
cp .env.example .env
# 用编辑器填入真实密钥（不要提交 .env）
```

### 必填

| 变量 | 用途 |
|------|------|
| `TIKHUB_API_KEY` | 抖音数据（TikHub） |
| `TIKHUB_BASE` | 大陆常用 `https://api.tikhub.dev`；海外可用 `https://api.tikhub.io` |
| `NEWAPI_BASE_URL` | OpenAI 兼容网关，需含 `/v1`（示例见 `.env.example`） |
| `NEWAPI_API_KEY` | 网关密钥 |
| `ASR_API_KEY` / `ASR_API_SECRET` | 讯飞语音听写 / 长语音转写 |

### 生产强烈建议

| 变量 | 建议 |
|------|------|
| `ADMIN_TOKEN` | 设成长随机串。设置后写接口需 `Authorization: Bearer …` 或 `x-admin-token`。未设则写操作全放行 |
| `DOUYIN_CACHE_MODE` | 保持 **`false`**（示例默认）。`true` 只适合本机省配额回放，会冻住扫描缓存 |
| `DOUYIN_SCAN_CUTOFF_DATE` | 扫描最早发布日 `YYYY-MM-DD`，按业务改 |
| `VIDEO_RETENTION_DAYS` | 仅 `scripts/cleanup.ts` 用；容器内需自行定时跑清理时再关注 |

### 一般不用改

| 变量 | 说明 |
|------|------|
| `DATA_ROOT` | Compose 已设 `/app/data`，与挂载卷一致 |
| `PORT` | 镜像 / compose 默认 3002 |

密钥与模型细节也可在运行后于 Web「设置」页写入业务库；env 仍是部署级默认。

## 4. 数据目录

```bash
mkdir -p data
```

挂载关系：`./data` → 容器 `/app/data`。

| 路径（容器内） | 内容 |
|----------------|------|
| `/app/data/douyin.db` | 业务库（bloggers / works / …） |
| `/app/data/mastra.db` | Mastra 运行记录、可观测 spans |
| `/app/data/videos` / `audio` | 下载与抽音频中间文件 |
| `/app/data/api-cache` | 仅 `DOUYIN_CACHE_MODE=true` 时使用 |

备份时优先拷贝整个 `data/`（尤其两个 `.db` 及可能的 `-wal` / `-shm`）。**先停容器再拷库文件更稳妥**。

## 5. 构建并启动

```bash
docker compose up -d --build
docker compose logs -f open-trading
```

启动时 entrypoint 会：

1. 确保 `DATA_ROOT` 目录存在  
2. 执行 `drizzle-kit push --force` 同步业务库表结构（含 `bloggers.disabled` 等）  
3. `next start -H 0.0.0.0 -p 3002`

访问：`http://<服务器 IP 或域名>:3002`。

健康粗检：

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/
# 或业务接口
curl -sS http://127.0.0.1:3002/api/douyin/bloggers
```

## 6. 常用运维命令

```bash
# 看日志
docker compose logs -f --tail=200 open-trading

# 改 .env 后重启（无需重建镜像）
docker compose up -d

# 代码更新后重建
git pull
docker compose up -d --build

# 停止 / 删除容器（不删 data 卷目录）
docker compose down

# 进入容器排查
docker compose exec open-trading bash
# 容器内：ffmpeg -version；ls -la /app/data
```

## 7. 防火墙与反向代理（可选）

- 云安全组 / ufw 放行 **TCP 3002**，或只对内网开放 3002，前面用 Nginx/Caddy 反代 443。  
- 反代时注意 WebSocket / 流式聊天（`/api/chat`）需要支持流式响应与较长超时。  
- 若公网暴露写接口，务必配置 `ADMIN_TOKEN`，并由网关或可信客户端带上鉴权头。

示例（Nginx 片段，按需改域名与证书）：

```nginx
location / {
  proxy_pass http://127.0.0.1:3002;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering off;
  proxy_read_timeout 3600s;
}
```

## 8. 镜像内已包含

- Node 22 + pnpm、Next 生产构建  
- **ffmpeg**（视频抽 16kHz 单声道 WAV）  
- **python3** + `mootdx` / `requests` / `pandas` / `stockstats`（Mastra skill 沙箱）  
- 启动时 schema 同步（`drizzle-kit` + `src/db`）

## 9. 故障排查

| 现象 | 排查 |
|------|------|
| 端口连不上 | `docker compose ps`；主机防火墙；是否映射 `3002:3002` |
| 博主列表 500 / `no such column` | 看启动日志是否 schema push 失败；确认 `./data` 可写且 `DATA_ROOT=/app/data` |
| 扫描没有新作品 | 确认 `DOUYIN_CACHE_MODE=false`；必要时清空或忽略 `data/api-cache` |
| 转写失败 `ffmpeg spawn failed` | 镜像应自带 ffmpeg；确认用的是本仓库 Dockerfile 构建的镜像 |
| 写接口 401 | 已设 `ADMIN_TOKEN`，请求需带 Bearer / `x-admin-token` |
| LLM / ASR 失败 | 检查 `NEWAPI_*`、`ASR_*` 与网关/讯飞控制台配额 |
| 磁盘涨 | `data/videos`、`data/audio`、`data/api-cache`；按需跑清理或关缓存模式 |

## 10. 与本机开发的区别

| | 本机 `pnpm dev` | 服务器 Docker |
|--|-----------------|---------------|
| 端口 | 3002 | 3002 |
| 数据目录 | 项目下 `data/` | 挂载的 `./data` → `/app/data` |
| schema | `pnpm setup` / `pnpm db:push` | 容器启动 entrypoint 自动 push |
| 缓存模式 | 可临时 `true` 省配额 | 保持 `false` |

更完整的架构说明见 [CLAUDE.md](./CLAUDE.md)；应用概览见 [README.md](./README.md)。
