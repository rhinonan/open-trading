# Mastra Skills 通用基建 + Agent 沙箱执行 实施计划（子项目 A）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Mastra Agent 建立通用 skills 运行时基建——从 GitHub URL 安装 SKILL.md 到 `data/skills/`，动态挂载到 agent，通过 Workspace + LocalSandbox 执行 skill 中的代码。

**Architecture:** 三层——① `skills-service.ts` 管理文件系统生命周期（安装/列表/启停/删除/挂载），② Mastra `Agent({ skills })` 动态 resolver 读 settings 按需注入，③ `Workspace(LocalFilesystem + LocalSandbox)` 为需执行代码的 agent 提供读写+命令执行能力。settings 表做「agent↔skill 挂载」的唯一真相源，UI 通过 REST API 驱动。

**Tech Stack:** Next.js 16 App Router + Mastra 1.51 + better-sqlite3 + React 19 + shadcn + Tailwind v4

## Global Constraints

- Node >= 22.13.0
- 开发机 Python 3.12.5（已确认），容器保留 python3 + pip + mootdx/requests/pandas/stockstats
- 所有 API 路由 try/catch → `{ success, error }` 风格，同现有路由
- 代码与 UI 注释使用中文
- settings KV 表存配置（不新增业务表）
- `npm run db:push` 推 schema 变更
- 无测试框架——校验靠 `tsc --noEmit` + `npm run lint` + `npm run build` + 手动冒烟

---

### Task 1: Skills 服务层（`skills-service.ts`）

**Files:**
- Create: `src/services/skills-service.ts`

**Interfaces:**
- Produces: `installFromUrl(url)`, `listSkills()`, `getSkill(name)`, `enableSkill(name)`, `disableSkill(name)`, `deleteSkill(name)`, `checkUpdate(name)`, `getAgentSkillMounts()`, `setAgentSkillMounts(mounts)`
- Consumes: `src/db` (settings table), `src/lib/llm-constants.ts` (nothing new, just pattern reference)

- [ ] **Step 1: 创建 `src/services/skills-service.ts` 骨架**

```ts
// src/services/skills-service.ts
import fs from "node:fs";
import path from "node:path";
import { getSetting, setSetting } from "@/services/settings-service";

const SKILLS_DIR = path.join(process.cwd(), "data", "skills");
const MOUNTS_KEY = "skills_agent_mounts";

export interface SkillMeta {
  name: string;
  description: string;
  version: string;
  sourceUrl: string;
  installedAt: string; // ISO
  enabled: boolean;
  contentHash: string;
}

function ensureSkillsDir(): void {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

function parseFrontmatter(md: string): { name?: string; description?: string; version?: string } | null {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const front: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) front[kv[1]] = kv[2].trim();
  }
  return front;
}

function enabledFlagPath(name: string): string {
  return path.join(SKILLS_DIR, name, ".enabled");
}
```

- [ ] **Step 2: 实现 `installFromUrl(url: string)`**

```ts
export async function installFromUrl(url: string): Promise<{ name: string; version: string }> {
  // 仅支持 public GitHub 仓库: github.com/<owner>/<repo>
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error("仅支持 public GitHub 仓库 URL（github.com/<owner>/<repo> 格式）");
  }
  const { owner, repo } = parsed;

  // 1. 取默认分支
  const repoMeta = await ghApi(`/repos/${owner}/${repo}`);
  const defaultBranch = repoMeta.default_branch;

  // 2. 取文件树（递归）
  const tree = await ghApi(`/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`);

  // 3. 找 SKILL.md
  const skillMdEntry = tree.tree.find((e: { path: string }) => e.path === "SKILL.md");
  if (!skillMdEntry) throw new Error("仓库中未找到 SKILL.md");

  // 4. 取 SKILL.md 内容
  const skillContent = await ghApiRaw(`/repos/${owner}/${repo}/contents/SKILL.md?ref=${defaultBranch}`);
  const skillMd = Buffer.from(skillContent.content, "base64").toString("utf-8");
  const front = parseFrontmatter(skillMd);
  if (!front?.name || !front?.description) {
    throw new Error("SKILL.md 缺少必填字段 name/description");
  }

  // 5. 写入 data/skills/<name>/
  const skillDir = path.join(SKILLS_DIR, front.name);
  ensureSkillsDir();
  if (fs.existsSync(skillDir)) {
    throw new Error(`Skill "${front.name}" 已存在，请先删除`);
  }
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillMd, "utf-8");

  // 6. 写入 .meta.json
  const meta: SkillMeta = {
    name: front.name,
    description: front.description,
    version: front.version ?? "0.0.0",
    sourceUrl: url,
    installedAt: new Date().toISOString(),
    enabled: false, // 默认禁用
    contentHash: simpleHash(skillMd),
  };
  fs.writeFileSync(path.join(skillDir, ".meta.json"), JSON.stringify(meta, null, 2), "utf-8");

  // 不写 .enabled 文件 → 动态 resolver 会跳过

  // 7. 下载附属文件（assets/ 等非 SKILL.md 的文件，限于文本）
  for (const entry of tree.tree) {
    if (entry.path === "SKILL.md" || entry.type !== "blob") continue;
    if (entry.path.includes(".github")) continue; // 跳过 CI/模板
    const content = await ghApiRaw(`/repos/${owner}/${repo}/contents/${entry.path}?ref=${defaultBranch}`);
    if (typeof content.content !== "string") continue;
    const destPath = path.join(skillDir, entry.path);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, Buffer.from(content.content, "base64").toString("utf-8"), "utf-8");
  }

  return { name: front.name, version: front.version ?? "0.0.0" };
}

// GitHub URL 解析
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

// GitHub API 请求（无鉴权，public 仓库速率 60 req/h 够用）
async function ghApi(pathStr: string): Promise<any> {
  const res = await fetch(`https://api.github.com${pathStr}`, {
    headers: { "Accept": "application/vnd.github+json", "User-Agent": "open-trading/1.0" },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText} — ${pathStr}`);
  }
  return res.json();
}

async function ghApiRaw(pathStr: string): Promise<any> {
  const res = await fetch(`https://api.github.com${pathStr}`, {
    headers: { "Accept": "application/vnd.github.raw+json", "User-Agent": "open-trading/1.0" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  return res.json();
}

function simpleHash(s: string): string {
  // djb2 — 够用的非加密 hash，不用引入 crypto
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h.toString(16);
}
```

- [ ] **Step 3: 实现 `listSkills()` 和 `getSkill(name)`**

```ts
export function listSkills(): SkillMeta[] {
  ensureSkillsDir();
  const result: SkillMeta[] = [];
  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(SKILLS_DIR, entry.name, ".meta.json");
    const skillMdPath = path.join(SKILLS_DIR, entry.name, "SKILL.md");
    if (!fs.existsSync(metaPath) || !fs.existsSync(skillMdPath)) continue;
    const meta: SkillMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    // 运行时检查启用状态
    meta.enabled = fs.existsSync(enabledFlagPath(entry.name));
    result.push(meta);
  }
  return result;
}

export function getSkill(name: string): SkillMeta & { content: string } | null {
  const skillDir = path.join(SKILLS_DIR, name);
  const metaPath = path.join(skillDir, ".meta.json");
  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(metaPath) || !fs.existsSync(skillMdPath)) return null;
  const meta: SkillMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  meta.enabled = fs.existsSync(enabledFlagPath(name));
  const content = fs.readFileSync(skillMdPath, "utf-8");
  return { ...meta, content };
}
```

- [ ] **Step 4: 实现启用/禁用/删除**

```ts
export function enableSkill(name: string): void {
  const skillDir = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(skillDir)) throw new Error(`Skill "${name}" 不存在`);
  fs.writeFileSync(enabledFlagPath(name), "", "utf-8");
}

export function disableSkill(name: string): void {
  const flag = enabledFlagPath(name);
  if (fs.existsSync(flag)) fs.unlinkSync(flag);
}

export function deleteSkill(name: string): void {
  const skillDir = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(skillDir)) throw new Error(`Skill "${name}" 不存在`);
  fs.rmSync(skillDir, { recursive: true, force: true });
}
```

- [ ] **Step 5: 实现 `checkUpdate(name)`**

```ts
export async function checkUpdate(name: string): Promise<{
  currentVersion: string; latestVersion: string; hasUpdate: boolean; diff?: string;
} | null> {
  const skill = getSkill(name);
  if (!skill) return null;

  const parsed = parseGitHubUrl(skill.sourceUrl);
  if (!parsed) throw new Error("来源 URL 格式不支持");

  const { owner, repo } = parsed;
  const repoMeta = await ghApi(`/repos/${owner}/${repo}`);
  const skillContent = await ghApiRaw(
    `/repos/${owner}/${repo}/contents/SKILL.md?ref=${repoMeta.default_branch}`
  );
  const latestMd = Buffer.from(skillContent.content, "base64").toString("utf-8");
  const latestFront = parseFrontmatter(latestMd);
  const latestVersion = latestFront?.version ?? "0.0.0";

  const hasUpdate = latestVersion !== skill.version;
  // diff 摘要：新旧 SKILL.md 的版本行差异
  let diff: string | undefined;
  if (hasUpdate) {
    diff = `版本 ${skill.version} → ${latestVersion}`;
  }
  return { currentVersion: skill.version, latestVersion, hasUpdate, diff };
}
```

- [ ] **Step 6: 实现挂载管理**

```ts
const DEFAULT_MOUNTS: Record<string, string[]> = {
  evaluatorAgent: ["a-stock-data"],
};

export async function getAgentSkillMounts(): Promise<Record<string, string[]>> {
  const raw = await getSetting(MOUNTS_KEY);
  if (!raw) return { ...DEFAULT_MOUNTS };
  try {
    return { ...DEFAULT_MOUNTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_MOUNTS };
  }
}

export async function setAgentSkillMounts(mounts: Record<string, string[]>): Promise<void> {
  await setSetting(MOUNTS_KEY, JSON.stringify(mounts));
}
```

- [ ] **Step 7: 添加 `getEnabledSkillPaths(agentKey)` 工具函数**

agent 动态 resolver 用：

```ts
export async function getEnabledSkillPaths(agentKey: string): Promise<string[]> {
  const mounts = await getAgentSkillMounts();
  const skillNames = mounts[agentKey] ?? [];
  const all = listSkills();
  return skillNames
    .filter((name) => {
      const skill = all.find((s) => s.name === name);
      return skill && skill.enabled;
    })
    .map((name) => path.join(SKILLS_DIR, name));
}
```

- [ ] **Step 8: 验证文件生成**

`npx tsc --noEmit` 确认无类型错误。

- [ ] **Step 9: Commit**

```bash
git add src/services/skills-service.ts
git commit -m "feat: add skills-service — install/list/enable/disable/mount from GitHub"
```

---

### Task 2: Skills API 路由

**Files:**
- Create: `src/app/api/skills/route.ts`
- Create: `src/app/api/skills/[name]/route.ts`
- Create: `src/app/api/skills/[name]/check-update/route.ts`
- Create: `src/app/api/skills/mounts/route.ts`

**Interfaces:**
- Consumes: `skills-service.ts`
- Produces: REST endpoints consumed by settings page UI

- [ ] **Step 1: 创建 `src/app/api/skills/route.ts`（列表 + 安装）**

```ts
// src/app/api/skills/route.ts
import { NextRequest } from "next/server";
import * as skillService from "@/services/skills-service";

export async function GET() {
  try {
    const skills = skillService.listSkills();
    return Response.json({ success: true, skills });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "获取列表失败" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string" || !url.trim()) {
      return Response.json({ success: false, error: "请提供 GitHub 仓库 URL" }, { status: 400 });
    }
    const result = await skillService.installFromUrl(url.trim());
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "安装失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 创建 `src/app/api/skills/[name]/route.ts`（单 skill 详情/启停/删除）**

```ts
// src/app/api/skills/[name]/route.ts
import { NextRequest } from "next/server";
import * as skillService from "@/services/skills-service";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await ctx.params;
    const skill = skillService.getSkill(name);
    if (!skill) return Response.json({ success: false, error: "Skill 不存在" }, { status: 404 });
    return Response.json({ success: true, skill });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "获取失败" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await ctx.params;
    const { action } = await req.json();
    if (action === "enable") skillService.enableSkill(name);
    else if (action === "disable") skillService.disableSkill(name);
    else return Response.json({ success: false, error: "仅支持 enable/disable" }, { status: 400 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "操作失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await ctx.params;
    skillService.deleteSkill(name);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "删除失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: 创建检查更新路由**

```ts
// src/app/api/skills/[name]/check-update/route.ts
import { NextRequest } from "next/server";
import * as skillService from "@/services/skills-service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await ctx.params;
    const result = await skillService.checkUpdate(name);
    if (!result) return Response.json({ success: false, error: "Skill 不存在" }, { status: 404 });
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "检查更新失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: 创建挂载管理路由**

```ts
// src/app/api/skills/mounts/route.ts
import { NextRequest } from "next/server";
import * as skillService from "@/services/skills-service";

export async function GET() {
  try {
    const mounts = await skillService.getAgentSkillMounts();
    const skills = skillService.listSkills();
    return Response.json({ success: true, mounts, skills: skills.map(s => s.name) });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "获取挂载失败" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { mounts } = await req.json();
    if (!mounts || typeof mounts !== "object") {
      return Response.json({ success: false, error: "mounts 需为对象" }, { status: 400 });
    }
    await skillService.setAgentSkillMounts(mounts);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "保存挂载失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 5: 验证**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/skills/
git commit -m "feat: add skills API routes — install/list/enable/disable/mount"
```

---

### Task 3: 设置页 Skills 管理 Tab UI

**Files:**
- Create: `src/app/settings/skills/page.tsx`
- Modify: `src/app/settings/layout.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/skills`, `PATCH/DELETE /api/skills/[name]`, `POST /api/skills/[name]/check-update`, `GET/PUT /api/skills/mounts`

- [ ] **Step 1: 更新 layout 加 skills tab**

在 `src/app/settings/layout.tsx` 的 tab 列表中加入 Skills：

读现有 layout 文件，在 tabs 数组加：

```tsx
{ label: "Skills", href: "/settings/skills" },
```

- [ ] **Step 2: 创建 Skills 管理页骨架**

```tsx
// src/app/settings/skills/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Download, Trash2, RefreshCw, CheckCircle, XCircle } from "lucide-react";

interface SkillMeta {
  name: string; description: string; version: string;
  sourceUrl: string; installedAt: string; enabled: boolean;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [url, setUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");
  const [mounts, setMounts] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const fetchSkills = useCallback(async () => {
    const res = await fetch("/api/skills");
    const data = await res.json();
    if (data.success) setSkills(data.skills);
  }, []);

  const fetchMounts = useCallback(async () => {
    const res = await fetch("/api/skills/mounts");
    const data = await res.json();
    if (data.success) setMounts(data.mounts);
  }, []);

  useEffect(() => {
    Promise.all([fetchSkills(), fetchMounts()]).finally(() => setLoading(false));
  }, [fetchSkills, fetchMounts]);

  async function handleInstall() {
    if (!url.trim()) return;
    setInstalling(true);
    setError("");
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      setUrl("");
      await fetchSkills();
    } catch {
      setError("网络错误");
    } finally {
      setInstalling(false);
    }
  }

  async function handleToggle(name: string, enabled: boolean) {
    await fetch(`/api/skills/${name}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: enabled ? "disable" : "enable" }),
    });
    await fetchSkills();
  }

  async function handleDelete(name: string) {
    if (!confirm(`确定删除 Skill "${name}"？此操作不可逆。`)) return;
    await fetch(`/api/skills/${name}`, { method: "DELETE" });
    await fetchSkills();
  }

  async function handleCheckUpdate(name: string) {
    const res = await fetch(`/api/skills/${name}/check-update`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      alert(data.hasUpdate ? `新版本 ${data.latestVersion} 可用！\n${data.diff ?? ""}` : "已是最新");
    }
  }

  async function handleToggleMount(agentKey: string, skillName: string) {
    const current = mounts[agentKey] ?? [];
    const next = current.includes(skillName)
      ? current.filter((s) => s !== skillName)
      : [...current, skillName];
    const newMounts = { ...mounts, [agentKey]: next };
    await fetch("/api/skills/mounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mounts: newMounts }),
    });
    setMounts(newMounts);
  }

  if (loading) return <div className="p-6">加载中...</div>;

  const agentKeys = Object.keys(mounts);

  return (
    <div className="space-y-6 p-6">
      {/* 安全提示 */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <span>⚠️ 安装 skill 即引入可执行代码，请仅从信任来源安装。skill 代码在服务器本机执行，可读取 skill 文件但无宿主环境变量。</span>
      </div>

      {/* 安装区 */}
      <div className="flex gap-2">
        <input
          type="url"
          placeholder="GitHub 仓库 URL（如 https://github.com/simonlin1212/a-stock-data）"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="border-input bg-background flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          onClick={handleInstall}
          disabled={installing || !url.trim()}
          className="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {installing ? "安装中..." : "安装"}
        </button>
      </div>
      {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">{error}</div>}

      {/* 已装列表 */}
      {skills.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center text-sm">暂无已安装的 Skill</div>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => (
            <div key={skill.name} className="rounded-lg border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{skill.name}</span>
                    <span className="text-muted-foreground text-xs">v{skill.version}</span>
                    {skill.enabled ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
                        <CheckCircle className="h-3 w-3" />已启用
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        <XCircle className="h-3 w-3" />已禁用
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">{skill.description}</p>
                  <div className="text-muted-foreground mt-1 text-xs">
                    来源: <code className="bg-muted rounded px-1 text-xs">{skill.sourceUrl}</code>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleToggle(skill.name, skill.enabled)} className="hover:bg-muted rounded-md px-2 py-1 text-xs">
                    {skill.enabled ? "禁用" : "启用"}
                  </button>
                  <button onClick={() => handleCheckUpdate(skill.name)} className="hover:bg-muted rounded-md px-2 py-1 text-xs">
                    <RefreshCw className="h-3 w-3" />
                  </button>
                  <button onClick={() => handleDelete(skill.name)} className="hover:bg-red-50 rounded-md px-2 py-1 text-xs text-red-500">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {/* 挂载勾选 */}
              <div className="mt-3 border-t pt-3">
                <span className="text-xs font-medium">挂载到 Agent：</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {agentKeys.map((ak) => (
                    <label key={ak} className="inline-flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={(mounts[ak] ?? []).includes(skill.name)}
                        onChange={() => handleToggleMount(ak, skill.name)}
                        className="h-3.5 w-3.5"
                      />
                      {ak}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 验证 build**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/layout.tsx src/app/settings/skills/
git commit -m "feat: add skills management tab to settings page"
```

---

### Task 4: Agent 动态 Skills Resolver 集成

**Files:**
- Modify: `src/mastra/index.ts`
- Create: `src/mastra/resolve-skills.ts`

**Interfaces:**
- Consumes: `skills-service.ts` (`getEnabledSkillPaths`)
- Produces: `resolveAgentSkills(agentKey)` → `SkillInput[]` — 传入 Agent 的 skills 参数

- [ ] **Step 1: 创建 `src/mastra/resolve-skills.ts`**

```ts
// src/mastra/resolve-skills.ts
import { getEnabledSkillPaths } from "@/services/skills-service";

/**
 * 动态 skills resolver：每次 agent 请求时从 settings 读取挂载关系，
 * 返回启用 skill 的 data/skills/<name>/ 路径数组。
 * 改挂载无需重启服务。
 */
export async function resolveAgentSkills(agentKey: string): Promise<string[]> {
  try {
    return await getEnabledSkillPaths(agentKey);
  } catch (err) {
    console.error(`[resolveAgentSkills] ${agentKey}:`, err);
    return [];
  }
}
```

- [ ] **Step 2: 更新现有 agent 或暂不做（opinionAgent 不挂 skill）**

opinionAgent 不挂 skill —— 纯粹 LLM 观点提取，维持现状。

评判 agent 在子项目 B 中新增时使用此 resolver。此处先提供一个验证方式：在 `src/mastra/index.ts` 中暂不做改动，等 Task 6。

- [ ] **Step 3: 验证**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/mastra/resolve-skills.ts
git commit -m "feat: add dynamic agent skills resolver"
```

---

### Task 5: Docker & 部署改造

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Dockerfile runner 阶段保留 python3 + 安装依赖**

当前 runner 阶段 purge 了 python3。需要保留并安装数据 skill 需要的包：

```dockerfile
# Stage 4: production runtime
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3003

# Native build tools required by better-sqlite3 at install time
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# ── NEW: 保留 python3 + 安装数据 skill 依赖 ──
RUN apt-get update && apt-get install -y python3-pip && \
    pip3 install --no-cache-dir mootdx requests pandas stockstats && \
    rm -rf /var/lib/apt/lists/*

# Clean up build tools (NOT python3 — skill sandbox 需要)
RUN apt-get purge -y make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Copy build output and static assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./

# Data directory for SQLite
RUN mkdir -p /app/data
VOLUME ["/app/data"]

# ── NEW: 非 root 运行 ──
USER node

EXPOSE 3003
CMD ["npm", "start"]
```

- [ ] **Step 2: docker-compose 加资源限制**

```yaml
services:
  app:
    build: .
    ports:
      - "3003:3003"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
    mem_limit: 2g
    cpus: 2
    restart: unless-stopped
```

- [ ] **Step 3: 验证构建**

```bash
docker build -t open-trading .
docker compose up -d
docker compose logs  # 确认服务正常启动
docker compose exec app python3 --version  # 确认 python3 可用
docker compose exec app pip3 list | grep mootdx  # 确认包已安装
```

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "chore: retain python3 for sandbox, add resource limits"
```

---

### Task 6: Evaluator Agent 骨架（子项目 A 的验收场景）

**Files:**
- Create: `src/mastra/agents/evaluator-agent.ts`
- Modify: `src/mastra/index.ts`
- Modify: `src/mastra/agent-meta.ts`

**Interfaces:**
- Consumes: `resolveAgentSkills` (Task 4), Mastra Workspace + LocalSandbox API
- Produces: `evaluatorAgent` — 注册到 Mastra 实例（agent 可用，子项目 B 接 workflow）

- [ ] **Step 1: 创建 `src/mastra/agents/evaluator-agent.ts`**

```ts
// src/mastra/agents/evaluator-agent.ts
import { Agent } from "@mastra/core/agent";
import { Workspace } from "@mastra/core/workspace";
import { newapiModel } from "@/mastra/model";
import { resolveAgentSkills } from "@/mastra/resolve-skills";

const EVALUATOR_INSTRUCTIONS = `你是 A 股行情评判专家。给定抖音博主口播转写文本，你需要：

1. 从转录中提取所有可验证的行情预测/判断（一作品可能有多条）
2. 对每条预测，根据数据判定其正确性

## 判定标准
- correct: 预测方向与实际完全一致，幅度偏差 ≤ 20%
- mostly_correct: 方向正确但幅度偏差 > 20%
- incorrect: 方向错误
- not_yet: 预测期限尚未到达，必须给出 verifiableAfter 日期
- not_applicable: 内容不涉及行情预测或无法验证

## 数据获取
- 你需要的数据：作品发布日期前后的指数日 K 线、涉及板块的排名/涨跌、涉及个股的实时价/K 线
- 优先走 skill 里的腾讯财经 API 和通达信 mootdx（不封 IP）
- 每次判定必须在 evidence 字段记录实际取到的关键数据点

## 输出
严格按照要求的 JSON schema 输出。`;

export const evaluatorAgent = new Agent({
  id: "evaluator-agent",
  name: "evaluator-agent",
  instructions: EVALUATOR_INSTRUCTIONS,
  model: newapiModel("evaluation"),
  skills: () => resolveAgentSkills("evaluatorAgent"),
  // workspace 暂不挂——子项目 B 的 workflow 里按需创建
  // 此处先挂 agent，子项目 A 验收时可聊天手动测试
});
```

- [ ] **Step 2: 注册到 Mastra 实例**

`src/mastra/index.ts`：

```ts
import { evaluatorAgent } from "@/mastra/agents/evaluator-agent";

export const mastra = new Mastra({
  agents: { opinionAgent, evaluatorAgent },
  workflows: { transcribeWorkWorkflow },
  // ...
});
```

- [ ] **Step 3: AGENT_META 补一行**

`src/mastra/agent-meta.ts`：

```ts
export const AGENT_META: Record<string, AgentMeta> = {
  opinionAgent: { flow: "opinion", description: "抖音博主观点摘要提取" },
  evaluatorAgent: { flow: "evaluation", description: "抖音博主观点准确度评判，对比行情数据判定预测正确性" },
};
```

- [ ] **Step 4: 验证 build**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/mastra/agents/evaluator-agent.ts src/mastra/index.ts src/mastra/agent-meta.ts
git commit -m "feat: add evaluator-agent skeleton with dynamic skill resolver"
```

---

### Task 7: Agents 页面 Skills 展示

**Files:**
- Modify: `src/app/agents/page.tsx`

- [ ] **Step 1: Agents 卡片加 skills 展示行**

在现有 agent 卡片组件底部（instructions 折叠区下方），加一行：

```tsx
{/* 在 agent 卡片循环中，每个 agent 卡片加 */}
<div className="mt-3 border-t pt-2">
  <span className="text-xs text-muted-foreground">已挂载 Skills：</span>
  {agentSkills[agentKey]?.length > 0 ? (
    <span className="ml-1 inline-flex flex-wrap gap-1">
      {agentSkills[agentKey].map((s) => (
        <span key={s} className="bg-muted rounded px-1.5 py-0.5 text-xs font-mono">{s}</span>
      ))}
    </span>
  ) : (
    <span className="ml-1 text-xs text-muted-foreground">无</span>
  )}
  <a href="/settings/skills" className="ml-2 text-xs underline underline-offset-2">
    管理 Skills →
  </a>
</div>
```

agentSkills 来自 `GET /api/skills/mounts`（页面加载时取一次）。

- [ ] **Step 2: 验证 build + lint**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/app/agents/page.tsx
git commit -m "feat: show mounted skills on agents page"
```

---

### 子项目 A 验收场景

在设置页：
1. 粘贴 `https://github.com/simonlin1212/a-stock-data` → 安装 → 看到 skill 卡片（默认禁用）
2. 点「启用」→ 状态变为绿叶
3. 勾选 `evaluatorAgent` 的 checkbox
4. 到 Agents 页 → evaluatorAgent 卡片显示「已挂载 Skills: a-stock-data」
5. 打开 chat 选 evaluatorAgent → 问「上证指数最近一周走势」→ agent 应该能通过 skill 获取数据端点信息（注意：sandbox 未挂时只能读 skill 内容，不能 execute——这是预期行为）
