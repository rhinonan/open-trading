# 服务器部署指南（Docker）

Open Trading 当前以 **单容器 + 挂载数据卷** 部署。默认对外端口 **3002**。

镜像在 **GitHub Actions** 中构建并推到 **GHCR**；服务器只 `pull` + `up`，避免在弱机上 `--build`。

## 1. 前置条件

| 项 | 说明 |
|----|------|
| 主机 | Linux 推荐；已装 Docker Engine + Compose 插件 |
| 资源 | 建议 ≥ 2 CPU、4GB 内存（compose 默认限 2 CPU / 2GB，可按需改） |
| 出网 | 需访问 TikHub、newapi（LLM 网关）、百炼 ASR（maas.aliyuncs.com）；拉取镜像需能访问 `ghcr.io` |
| 端口 | 主机 `3002` 空闲（或改 compose 端口映射） |

**不要水平扩多个副本**：转写 / 评判队列是进程内 runner，多实例会抢任务、状态不一致。

## 2. 镜像从哪里来

| 角色 | 做什么 |
|------|--------|
| 开发机 | `git push`（或打 `v*` tag）；日常开发用 `pnpm dev`，不必 Docker 构建 |
| GitHub Actions | 见 `.github/workflows/docker-publish.yml`：`main` 上**业务相关路径**变更 / `v*` tag / 手动 Run → 构建 `linux/amd64` → 推 GHCR（仅改文档不构建；`paths` 不对 tag 生效） |
| 服务器 | `docker compose pull` + `up`，**不要** `up --build` |

镜像名：

```text
ghcr.io/rhinonan/open-trading:latest   # main 分支最新
ghcr.io/rhinonan/open-trading:<sha>    # 短 commit（metadata-action）
ghcr.io/rhinonan/open-trading:v0.1.0   # 若推送了 git tag v0.1.0
```

### 首次发布后：Package 可见性

1. 打开仓库 → **Packages**，或 `https://github.com/users/rhinonan/packages`
2. 点开 `open-trading` → **Package settings**
3. 仓库为私有时，建议 Package 也设为 **Private**
4. 私有镜像：服务器需能读该 package（见下一节登录）

公开仓库 + 公开 Package 时可匿名 `pull`；私有则必须 `docker login`。

## 3. 获取部署文件

服务器上不必完整 clone 业务代码来构建，但需要 **compose、.env、data 目录**。任选其一：

```bash
# A. 仍 clone 仓库（最简单，compose 与文档随仓库更新）
git clone git@github.com:rhinonan/open-trading.git open-trading
cd open-trading
# 或已有目录：git pull

# B. 只拷贝 docker-compose.yml 到某目录，自行维护 .env 与 data/
```

## 4. 配置 `.env`

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
| `DASHSCOPE_API_KEY` | 阿里云百炼 Paraformer-v2 ASR |

### 生产强烈建议

| 变量 | 建议 |
|------|------|
| `ADMIN_TOKEN` | 设成长随机串。写接口需 Bearer / `x-admin-token`，**或** 浏览器在 `/login` 用同一令牌登录后的会话 cookie。同时锁定 `/settings/*`（侧栏隐藏设置，无注册）。未设则写操作与设置页全放行 |
| `SESSION_SECRET` | 可选。会话 HMAC 密钥；不设则用 `ADMIN_TOKEN` 签名 |
| `DOUYIN_CACHE_MODE` | 保持 **`false`**（示例默认）。`true` 只适合本机省配额回放，会冻住扫描缓存 |
| `DOUYIN_SCAN_CUTOFF_DATE` | 扫描最早发布日 `YYYY-MM-DD`，按业务改 |
| `PUBLIC_BASE_URL` | 本站公网地址，百炼通过此地址拉取音频文件。生产填 `https://trading.tdance.cc` |

### 一般不用改

| 变量 | 说明 |
|------|------|
| `DATA_ROOT` | Compose 已设 `/app/data`，与挂载卷一致 |
| `PORT` | 镜像 / compose 默认 3002 |

密钥与模型细节也可在运行后于 Web「设置」页写入业务库；env 仍是部署级默认。

## 5. 数据目录

```bash
mkdir -p data
```

挂载关系：`./data` → 容器 `/app/data`。

| 路径（容器内） | 内容 |
|----------------|------|
| `/app/data/douyin.db` | 业务库（bloggers / works / …） |
| `/app/data/mastra.db` | Mastra 运行记录、可观测 spans |
| `/app/data/videos` / `audio` / `files` | 下载、抽音频中间文件 / 文件服务上传存储 |
| `/app/data/api-cache` | 仅 `DOUYIN_CACHE_MODE=true` 时使用 |

备份时优先拷贝整个 `data/`（尤其两个 `.db` 及可能的 `-wal` / `-shm`）。**先停容器再拷库文件更稳妥**。

## 6. 拉取镜像并启动

### 6.1 私有 GHCR 时先登录（一次性）

在 GitHub → **Settings → Developer settings → Personal access tokens** 创建 token：

- Fine-grained：对该 package / 仓库勾选 **read** Packages；或
- Classic：勾选 `read:packages`

```bash
echo YOUR_GITHUB_PAT | docker login ghcr.io -u rhinonan --password-stdin
```

凭证会保存在 Docker 配置中；token 泄露后立即在 GitHub 撤销。

### 6.2 启动

```bash
docker compose pull
docker compose up -d
docker compose logs -f open-trading
```

`docker-compose.yml` 使用 `image: ghcr.io/rhinonan/open-trading:latest` 与 `pull_policy: always`，**没有** `build: .`，避免在服务器上编译。

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

### 6.3 日常更新（推荐流程）

```bash
# 开发机：合并/推送到 main（触发 Actions）
git push origin main

# 打开 GitHub → Actions，确认 “Build and push Docker image” 成功

# 服务器：
cd /path/to/open-trading   # 或你放 compose 的目录
docker compose pull
docker compose up -d
# 含 schema 变更时更稳妥：
# docker compose down && docker compose up -d
```

固定版本回滚示例：

```bash
# 临时改 compose 的 image 为某 tag，或：
docker pull ghcr.io/rhinonan/open-trading:v0.1.0
# 将 compose 中 latest 改为该 tag 后 up -d
```

## 7. 常用运维命令

```bash
# 看日志
docker compose logs -f --tail=200 open-trading

# 改 .env 后重启（无需重新拉镜像）
docker compose up -d

# 拉新镜像并滚动（代码已由 CI 打进镜像）
docker compose pull
docker compose up -d

# 停止 / 删除容器（不删 data 卷目录）
docker compose down

# 进入容器排查
docker compose exec open-trading bash
# 容器内：ffmpeg -version；ls -la /app/data
```

## 8. 防火墙与反向代理（可选）

- 云安全组 / ufw 放行 **TCP 3002**，或只对内网开放 3002，前面用 Nginx/Caddy 反代 443。  
- 反代时注意 WebSocket / 流式聊天（`/api/chat`）需要支持流式响应与较长超时。  
- 若公网暴露写接口或设置页，务必配置 `ADMIN_TOKEN`。脚本/API 带鉴权头；浏览器走 `/login`（无注册）。可选 `SESSION_SECRET` 单独签会话。

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

## 9. 镜像内已包含

- Node 22 + pnpm、Next 生产构建  
- **ffmpeg**（视频抽 16kHz 单声道 WAV）  
- **python3** + `mootdx` / `requests` / `pandas` / `stockstats`（Mastra skill 沙箱）  
- 启动时 schema 同步（`drizzle-kit` + `src/db`）

## 10. 故障排查

| 现象 | 排查 |
|------|------|
| `pull` 401 / denied | 私有 Package 未登录，或 PAT 无 `read:packages`；`docker login ghcr.io` |
| `pull` 超时 / 很慢 | 检查到 `ghcr.io` 的网络；香港一般可用，仍失败可考虑镜像同步到其他 registry |
| Actions 构建失败 | GitHub → Actions 看日志；常见为 Dockerfile/`pnpm build` 错误 |
| 端口连不上 | `docker compose ps`；主机防火墙；是否映射 `3002:3002` |
| 博主列表 500 / `no such column` | 看启动日志是否 schema push 失败；确认 `./data` 可写且 `DATA_ROOT=/app/data` |
| API 500 但页面只显示失败 | 看容器/进程 stdout：应有一行 JSON，`event":"api.error"`，含 `path`/`message`/`stack`。`docker compose logs -f open-trading` |
| 扫描没有新作品 | 确认 `DOUYIN_CACHE_MODE=false`；必要时清空或忽略 `data/api-cache` |
| 转写失败 `ffmpeg spawn failed` | 镜像应自带 ffmpeg；确认用的是本仓库 Dockerfile 构建的镜像 |
| 写接口 401 | 已设 `ADMIN_TOKEN`：脚本/API 带 Bearer 或 `x-admin-token`；浏览器先打开 `/login` 用同一令牌登录（会话 cookie 亦可通过 requireAdmin） |
| 设置页跳登录 | 已设 `ADMIN_TOKEN` 且未登录属预期；登录后可进 `/settings/*`，侧栏才会显示「设置」 |
| LLM / ASR 失败 | 检查 `NEWAPI_*`、`DASHSCOPE_API_KEY` 与百炼控制台配额 |
| 磁盘涨 | `data/videos`、`data/audio`、`data/api-cache`；按需跑清理或关缓存模式 |

## 11. 与本机开发的区别

| | 本机 `pnpm dev` | 服务器 Docker |
|--|-----------------|---------------|
| 端口 | 3002 | 3002 |
| 数据目录 | 项目下 `data/` | 挂载的 `./data` → `/app/data` |
| schema | `pnpm setup` / `pnpm db:push` | 容器启动 entrypoint 自动 push |
| 缓存模式 | 可临时 `true` 省配额 | 保持 `false` |
| 镜像构建 | 不需要 | CI 构建；服务器只 pull |

更完整的架构说明见 [CLAUDE.md](./CLAUDE.md)；应用概览见 [README.md](./README.md)。

## 12. 可选：本机构建（应急 / 未走 CI）

正常路径不需要。若 Actions 不可用、需临时打镜像：

```bash
# 本机（注意服务器为 amd64 时加 --platform）
docker build --platform linux/amd64 -t ghcr.io/rhinonan/open-trading:latest .
echo YOUR_PAT | docker login ghcr.io -u rhinonan --password-stdin
docker push ghcr.io/rhinonan/open-trading:latest
```

服务器仍只 `docker compose pull && docker compose up -d`。

**不要**在资源紧张的服务器上执行 `docker compose up --build`：当前 compose 已去掉 `build:`，若自行加回会重新在服务器上完整编译。
