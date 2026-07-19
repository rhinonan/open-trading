# Skills 管理页改造 + 安装链路修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 skill 发布后列表空白（`.candidate.json` 未转 `.meta.json`），并把 `/settings/skills` 改成表格 + 三步安装向导，安装时落盘 license/commit，支持覆盖更新与挂载弹窗。

**Architecture:** 服务层先修发布契约与 meta 扩展（可单测），再改 3 个 API 路由入参/出参，最后用语义 table + Dialog 重做页面。`DATA_ROOT` 路径改为每次调用读取，便于 vitest 隔离。

**Tech Stack:** Next.js 16 App Router + React 19 + Tailwind v4 + shadcn Dialog/Button/Badge + vitest + Node fs

## Global Constraints

- 包管理器 **pnpm**；Node >= 22.13.0
- 落盘路径一律 `dataPath()` / `getDataRoot()`，禁止硬编码 `process.cwd()/data`
- 代码注释与 UI 文案使用中文
- API 风格 `{ success, error? }`；写操作走 `requireAdmin`
- 不新增 npm 依赖（无 table/stepper 组件库）
- 不重做 skill-review workflow / agent
- 挂载仍用 settings KV `skills_agent_mounts`
- 表行类型若涉及 DB 才用 `$inferSelect`；本功能纯 fs meta JSON

## File Map

| 文件 | 职责 |
|---|---|
| `src/services/skills-service.ts` | 发布规范化、meta 扩展、license/commit、overwrite、migrate、删 mounts；路径惰性解析 |
| `tests/skills-service.test.ts` | 发布/列表/迁移/覆盖/协议解析单测 |
| `src/app/api/skills/route.ts` | POST 支持 `force` |
| `src/app/api/skills/staging/[name]/publish/route.ts` | `overwrite` + 部分成功响应 |
| `src/app/api/skills/[name]/route.ts` | DELETE 时清理 mounts（若服务层已做则仅透传） |
| `src/app/settings/skills/page.tsx` | 页面壳：toolbar、状态、挂接子弹 |
| `src/app/settings/skills/SkillsTable.tsx` | 已装 skill 表格 |
| `src/app/settings/skills/InstallSkillDialog.tsx` | 三步安装/更新向导 |
| `src/app/settings/skills/MountSkillDialog.tsx` | Agent 挂载勾选 |

---

### Task 1: skills-service — 路径惰性 + meta 扩展 + 发布契约修复

**Files:**
- Modify: `src/services/skills-service.ts`
- Create: `tests/skills-service.test.ts`

**Interfaces:**
- Consumes: `dataPath`, `getSetting`/`setSetting`（mounts 相关可在 Task 2 再动）
- Produces:
  - `SkillMeta` 增加 `license: string | null`, `commit: string | null`, `commitShort: string | null`
  - `detectLicense(text: string): string | null`（export 便于测）
  - `publishCandidates(batchId, names, opts?: { overwrite?: boolean }): { published: string[]; errors: string[] }`
  - `listSkills()` 对幽灵目录（仅有 `.candidate.json`）自动 migrate 为 `.meta.json`
  - `installToStaging(url, opts?: { force?: boolean })` — force 时先 discard 同 batchId
  - 内部 `skillsDir()` / `stagingRoot()` 每次调用 `dataPath(...)`，**禁止**模块顶层冻结路径常量

- [ ] **Step 1: 写失败单测（路径隔离 + 发布规范化）**

创建 `tests/skills-service.test.ts`：

```ts
// tests/skills-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ORIGINAL_DATA_ROOT = process.env.DATA_ROOT;
let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skills-test-"));
  process.env.DATA_ROOT = tmpRoot;
  // 确保后续 import / 动态 import 读到新 DATA_ROOT
});

afterEach(() => {
  if (ORIGINAL_DATA_ROOT === undefined) delete process.env.DATA_ROOT;
  else process.env.DATA_ROOT = ORIGINAL_DATA_ROOT;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// 用动态 import 避免模块在 DATA_ROOT 设置前缓存错误路径
async function loadService() {
  // 清掉模块缓存，使 skills-service 重新求值（若仍有顶层常量则本测会失败——正是我们要修的）
  const key = require.resolve("@/services/skills-service");
  delete require.cache[key];
  return import("@/services/skills-service");
}

describe("detectLicense", () => {
  it("识别 MIT / Apache-2.0", async () => {
    const { detectLicense } = await loadService();
    expect(detectLicense("MIT License\n\nCopyright")).toBe("MIT");
    expect(
      detectLicense("Apache License\nVersion 2.0, January 2004")
    ).toBe("Apache-2.0");
    expect(detectLicense("proprietary stuff")).toBeNull();
  });
});

describe("publishCandidates meta 规范化", () => {
  it("将 .candidate.json 转为 .meta.json 后 listSkills 可见", async () => {
    const svc = await loadService();
    const batchId = "demo-repo";
    const skillName = "demo-skill";
    // 手工构造 staging 结构
    const stagingSkill = path.join(
      tmpRoot,
      "skills-staging",
      batchId,
      "skills",
      skillName
    );
    fs.mkdirSync(stagingSkill, { recursive: true });
    fs.writeFileSync(
      path.join(stagingSkill, "SKILL.md"),
      "---\nname: demo-skill\ndescription: d\nversion: 1.0.0\n---\nbody\n",
      "utf-8"
    );
    const candidate = {
      name: skillName,
      description: "d",
      version: "1.0.0",
      sourceUrl: "https://github.com/o/r",
      installedAt: new Date().toISOString(),
      enabled: false,
      contentHash: "abc",
      license: "MIT",
      commit: "abcdef1234567890",
      commitShort: "abcdef1",
    };
    fs.writeFileSync(
      path.join(stagingSkill, ".candidate.json"),
      JSON.stringify(candidate, null, 2)
    );
    // LICENSE 在 batch 根
    fs.writeFileSync(
      path.join(tmpRoot, "skills-staging", batchId, "LICENSE"),
      "MIT License\n",
      "utf-8"
    );
    const batch = {
      batchId,
      sourceUrl: "https://github.com/o/r",
      installedAt: new Date().toISOString(),
      candidates: [
        {
          name: skillName,
          description: "d",
          version: "1.0.0",
          sourcePath: "SKILL.md",
        },
      ],
      review: {
        status: "passed",
        reviewedAt: new Date().toISOString(),
        verdict: "pass",
        summary: "ok",
        issues: [],
      },
    };
    fs.writeFileSync(
      path.join(tmpRoot, "skills-staging", batchId, ".batch.json"),
      JSON.stringify(batch, null, 2)
    );

    const result = svc.publishCandidates(batchId, [skillName]);
    expect(result.published).toEqual([skillName]);
    expect(result.errors).toEqual([]);

    const dest = path.join(tmpRoot, "skills", skillName);
    expect(fs.existsSync(path.join(dest, ".meta.json"))).toBe(true);
    expect(fs.existsSync(path.join(dest, ".candidate.json"))).toBe(false);
    expect(fs.existsSync(path.join(dest, "LICENSE"))).toBe(true);

    const listed = svc.listSkills();
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe(skillName);
    expect(listed[0].license).toBe("MIT");
    expect(listed[0].commitShort).toBe("abcdef1");
  });

  it("overwrite=false 时已存在返回 errors 且不抛", async () => {
    const svc = await loadService();
    // 先放一个正式 skill
    const dest = path.join(tmpRoot, "skills", "demo-skill");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "SKILL.md"), "x", "utf-8");
    fs.writeFileSync(
      path.join(dest, ".meta.json"),
      JSON.stringify({
        name: "demo-skill",
        description: "old",
        version: "0.1.0",
        sourceUrl: "https://github.com/o/r",
        installedAt: "2020-01-01T00:00:00.000Z",
        enabled: false,
        contentHash: "x",
        license: null,
        commit: null,
        commitShort: null,
      }),
      "utf-8"
    );
    // staging candidate 同名
    const batchId = "demo-repo";
    const stagingSkill = path.join(
      tmpRoot,
      "skills-staging",
      batchId,
      "skills",
      "demo-skill"
    );
    fs.mkdirSync(stagingSkill, { recursive: true });
    fs.writeFileSync(path.join(stagingSkill, "SKILL.md"), "new", "utf-8");
    fs.writeFileSync(
      path.join(stagingSkill, ".candidate.json"),
      JSON.stringify({
        name: "demo-skill",
        description: "new",
        version: "2.0.0",
        sourceUrl: "https://github.com/o/r",
        installedAt: new Date().toISOString(),
        enabled: false,
        contentHash: "y",
        license: null,
        commit: null,
        commitShort: null,
      })
    );
    fs.writeFileSync(
      path.join(tmpRoot, "skills-staging", batchId, ".batch.json"),
      JSON.stringify({
        batchId,
        sourceUrl: "https://github.com/o/r",
        installedAt: new Date().toISOString(),
        candidates: [
          {
            name: "demo-skill",
            description: "new",
            version: "2.0.0",
            sourcePath: "SKILL.md",
          },
        ],
        review: {
          status: "passed",
          reviewedAt: new Date().toISOString(),
          verdict: "pass",
          summary: "ok",
          issues: [],
        },
      })
    );

    const result = svc.publishCandidates(batchId, ["demo-skill"], {
      overwrite: false,
    });
    expect(result.published).toEqual([]);
    expect(result.errors.some((e: string) => e.includes("已存在"))).toBe(true);
    const meta = JSON.parse(
      fs.readFileSync(path.join(dest, ".meta.json"), "utf-8")
    );
    expect(meta.version).toBe("0.1.0");
  });

  it("overwrite=true 覆盖并保留 enabled", async () => {
    const svc = await loadService();
    const dest = path.join(tmpRoot, "skills", "demo-skill");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "SKILL.md"), "old", "utf-8");
    fs.writeFileSync(path.join(dest, ".enabled"), "", "utf-8");
    fs.writeFileSync(
      path.join(dest, ".meta.json"),
      JSON.stringify({
        name: "demo-skill",
        description: "old",
        version: "0.1.0",
        sourceUrl: "https://github.com/o/r",
        installedAt: "2020-01-01T00:00:00.000Z",
        enabled: false,
        contentHash: "x",
        license: null,
        commit: null,
        commitShort: null,
      })
    );
    const batchId = "demo-repo";
    const stagingSkill = path.join(
      tmpRoot,
      "skills-staging",
      batchId,
      "skills",
      "demo-skill"
    );
    fs.mkdirSync(stagingSkill, { recursive: true });
    fs.writeFileSync(path.join(stagingSkill, "SKILL.md"), "new body", "utf-8");
    fs.writeFileSync(
      path.join(stagingSkill, ".candidate.json"),
      JSON.stringify({
        name: "demo-skill",
        description: "new",
        version: "2.0.0",
        sourceUrl: "https://github.com/o/r",
        installedAt: new Date().toISOString(),
        enabled: false,
        contentHash: "y",
        license: "MIT",
        commit: "11111112222222",
        commitShort: "1111111",
      })
    );
    fs.writeFileSync(
      path.join(tmpRoot, "skills-staging", batchId, ".batch.json"),
      JSON.stringify({
        batchId,
        sourceUrl: "https://github.com/o/r",
        installedAt: new Date().toISOString(),
        candidates: [
          {
            name: "demo-skill",
            description: "new",
            version: "2.0.0",
            sourcePath: "SKILL.md",
          },
        ],
        review: {
          status: "passed",
          reviewedAt: new Date().toISOString(),
          verdict: "pass",
          summary: "ok",
          issues: [],
        },
      })
    );

    const result = svc.publishCandidates(batchId, ["demo-skill"], {
      overwrite: true,
    });
    expect(result.published).toEqual(["demo-skill"]);
    const meta = JSON.parse(
      fs.readFileSync(path.join(dest, ".meta.json"), "utf-8")
    );
    expect(meta.version).toBe("2.0.0");
    expect(fs.existsSync(path.join(dest, ".enabled"))).toBe(true);
    expect(fs.readFileSync(path.join(dest, "SKILL.md"), "utf-8")).toContain(
      "new body"
    );
  });

  it("listSkills 迁移幽灵 .candidate.json", async () => {
    const svc = await loadService();
    const dest = path.join(tmpRoot, "skills", "ghost");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "SKILL.md"), "body", "utf-8");
    fs.writeFileSync(
      path.join(dest, ".candidate.json"),
      JSON.stringify({
        name: "ghost",
        description: "g",
        version: "1.0.0",
        sourceUrl: "https://github.com/o/r",
        installedAt: "2020-01-01T00:00:00.000Z",
        enabled: false,
        contentHash: "z",
      })
    );

    const listed = svc.listSkills();
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("ghost");
    expect(fs.existsSync(path.join(dest, ".meta.json"))).toBe(true);
    expect(fs.existsSync(path.join(dest, ".candidate.json"))).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm test tests/skills-service.test.ts`

Expected: FAIL（`detectLicense` 不存在 / `publishCandidates` 仍 throw 或留下 `.candidate.json` / 路径可能写到真实 `data/`）

- [ ] **Step 3: 改 `skills-service.ts` 核心实现**

要点（实现时对照，不要留半成品）：

1. **删掉顶层** `const SKILLS_DIR = dataPath("skills")` / `STAGING_DIR`，改为：

```ts
function skillsRoot(): string {
  return dataPath("skills");
}
function stagingRoot(): string {
  return dataPath("skills-staging");
}
```

所有原 `SKILLS_DIR` / `STAGING_DIR` 引用改为函数调用。`skillDir` / `stagingDir` / `enabledFlagPath` 同步改。

2. **扩展 `SkillMeta`：**

```ts
export interface SkillMeta {
  name: string;
  description: string;
  version: string;
  sourceUrl: string;
  installedAt: string;
  enabled: boolean;
  contentHash: string;
  license: string | null;
  commit: string | null;
  commitShort: string | null;
}
```

旧 json 缺字段时读入补 `null`。

3. **export `detectLicense`：**

```ts
export function detectLicense(text: string): string | null {
  const t = text.slice(0, 2000);
  if (/MIT License/i.test(t) || (/^\s*MIT\b/m.test(t) && /Permission is hereby granted/i.test(t)))
    return "MIT";
  if (/Apache License/i.test(t) && /Version 2\.0/i.test(t)) return "Apache-2.0";
  if (/BSD 3-Clause/i.test(t) || /Redistribution and use in source and binary forms/i.test(t) && /3-clause/i.test(t))
    return "BSD-3-Clause";
  if (/BSD 2-Clause/i.test(t)) return "BSD-2-Clause";
  if (/\bISC License\b/i.test(t)) return "ISC";
  if (/This is free and unencumbered software released into the public domain/i.test(t) || /\bUnlicense\b/i.test(t))
    return "Unlicense";
  if (/CC0 1\.0/i.test(t) || /Creative Commons Zero/i.test(t)) return "CC0";
  return null;
}
```

4. **`normalizeMeta(raw: Partial<SkillMeta> & { name: string }): SkillMeta`** — 补默认 null 字段。

5. **`finalizeSkillDir(dest: string, opts: { sourceUrl: string; license?: string | null; commit?: string | null; commitShort?: string | null; wasEnabled?: boolean })`：**
   - 若存在 `.candidate.json`：读入 → `normalizeMeta` → 合并 opts 的 license/commit → 写 `.meta.json` → 删 `.candidate.json`
   - 若仅有 `.meta.json`：读入补字段再写回
   - 若 `wasEnabled`：写 `.enabled`

6. **`publishCandidates` 重写签名与逻辑：**

```ts
export function publishCandidates(
  batchId: string,
  names: string[],
  opts: { overwrite?: boolean } = {},
): { published: string[]; errors: string[] } {
  const overwrite = opts.overwrite === true;
  // ... 校验 batch + verdict
  const published: string[] = [];
  const errors: string[] = [];
  // 从 batch 根解析 license（LICENSE*）
  // 从 batch 或 candidate meta 取 commit（installToStaging 应写入 batch 扩展字段或 candidate）
  for (const name of names) {
    // dest exists?
    // if exists && !overwrite → errors.push; continue
    // if exists && overwrite → wasEnabled = exists .enabled; rmSync dest
    // renameSync src → dest
    // copy LICENSE* from batch root into dest if present
    // finalizeSkillDir(dest, ...)
    // published.push(name)
  }
  // 更新 batch candidates / 清空 staging
  // **不再**因 errors 而 throw；由调用方看 published/errors
  return { published, errors };
}
```

7. **`listSkills` 幽灵迁移：**

```ts
const candidatePath = path.join(dir, ".candidate.json");
const metaPath = path.join(dir, ".meta.json");
if (!fs.existsSync(metaPath) && fs.existsSync(candidatePath) && fs.existsSync(skillMdPath)) {
  finalizeSkillDir(dir, { sourceUrl: "" }); // 内部从 candidate 读
}
if (!fs.existsSync(metaPath) || !fs.existsSync(skillMdPath)) continue;
```

8. **`installToStaging(url, opts?: { force?: boolean })`：**
   - 在创建 batchDir 前：若存在且 `force` → `discardStaging(batchId)`；若存在且 !force → 现有错误
   - 拉取默认分支 HEAD commit：`GET /repos/{owner}/{repo}/commits/{default_branch}`，取 `sha`，写入每个 candidate 的 `.candidate.json`（`commit`/`commitShort`）
   - 解析 LICENSE 内容 `detectLicense`，写入 candidate `license`
   - 其余下载逻辑保持

9. **`installFromUrl`（遗留直装路径）**：写 meta 时同样带 `license`/`commit` 字段（可 null），避免类型不一致。

- [ ] **Step 4: 跑测通过**

Run: `pnpm test tests/skills-service.test.ts`

Expected: PASS（全部用例）

若动态 import + require.cache 在 ESM 下不好使：改为在 `beforeEach` 设置 `DATA_ROOT` 后，因路径已惰性，`import { ... } from "@/services/skills-service"` 静态导入即可，**删掉 require.cache 技巧**。以惰性 `skillsRoot()` 为准。

- [ ] **Step 5: Commit**

```bash
git add src/services/skills-service.ts tests/skills-service.test.ts
git commit -m "$(cat <<'EOF'
fix(skills): normalize .meta.json on publish and heal ghost installs

Publish no longer leaves .candidate.json as the only meta; listSkills
migrates legacy dirs; SkillMeta gains license/commit fields.
EOF
)"
```

---

### Task 2: deleteSkill 清理 mounts + install force 收口

**Files:**
- Modify: `src/services/skills-service.ts`（`deleteSkill`、可选 `removeSkillFromAllMounts`）
- Modify: `tests/skills-service.test.ts`（mounts 清理可 mock settings 较难——若 getSetting 依赖真实 DB，本 task 用集成式跳过 mounts 单测，改为在 deleteSkill 内 await 清理并在手动冒烟验证；**若** settings 难测，至少保证代码路径正确）

**Interfaces:**
- Produces: `deleteSkill` 变为 `async function deleteSkill(name: string): Promise<void>`，内部删目录后清理 mounts
- 或同步删目录 + `export async function purgeSkillFromMounts(name: string)`

推荐：

```ts
export function deleteSkill(name: string): void { /* rm dir 同现有 */ }

export async function purgeSkillFromMounts(name: string): Promise<void> {
  const mounts = await getAgentSkillMounts();
  let changed = false;
  const next: Record<string, string[]> = {};
  for (const [agent, list] of Object.entries(mounts)) {
    const filtered = list.filter((s) => s !== name);
    if (filtered.length !== list.length) changed = true;
    next[agent] = filtered;
  }
  if (changed) await setAgentSkillMounts(next);
}
```

- [ ] **Step 1: 实现 `purgeSkillFromMounts` + 保持 `deleteSkill` 同步删盘**

- [ ] **Step 2: 在 `src/app/api/skills/[name]/route.ts` DELETE 分支**

正式 skill 删除：

```ts
skillService.deleteSkill(name);
await skillService.purgeSkillFromMounts(name);
```

staging discard 分支不变。

- [ ] **Step 3: Commit**

```bash
git add src/services/skills-service.ts src/app/api/skills/[name]/route.ts
git commit -m "fix(skills): remove deleted skill from agent mounts"
```

---

### Task 3: API 路由适配 force / overwrite / 部分成功

**Files:**
- Modify: `src/app/api/skills/route.ts`
- Modify: `src/app/api/skills/staging/[name]/publish/route.ts`

**Interfaces:**
- Consumes: `installToStaging(url, { force })`, `publishCandidates(id, names, { overwrite })`
- Produces: HTTP 契约见 spec §5

- [ ] **Step 1: 改 POST `/api/skills`**

```ts
const { url, force } = await req.json();
// ...
const batch = await skillService.installToStaging(url.trim(), {
  force: force === true,
});
// review workflow 不变
```

- [ ] **Step 2: 改 publish 路由**

```ts
const { names, overwrite } = await req.json();
const result = skillService.publishCandidates(batchId, names, {
  overwrite: overwrite === true,
});
if (result.published.length === 0 && result.errors.length > 0) {
  return Response.json(
    { success: false, error: result.errors.join("; "), ...result },
    { status: 409 },
  );
}
return Response.json({ success: true, ...result });
```

- [ ] **Step 3: 手动用 curl 或稍后 UI 冒烟（本步可先 commit）**

```bash
git add src/app/api/skills/route.ts src/app/api/skills/staging/[name]/publish/route.ts
git commit -m "feat(skills): support force install and overwrite publish"
```

---

### Task 4: SkillsTable 表格组件

**Files:**
- Create: `src/app/settings/skills/SkillsTable.tsx`
- Create: `src/app/settings/skills/types.ts`（可选：共享前端类型）

**Interfaces:**
- Consumes: `SkillMeta` 形状（前端 interface 可复制扩展字段）
- Produces: 展示表格 + 回调

```ts
// types.ts
export interface SkillRow {
  name: string;
  description: string;
  version: string;
  sourceUrl: string;
  installedAt: string;
  enabled: boolean;
  license: string | null;
  commit: string | null;
  commitShort: string | null;
}
```

- [ ] **Step 1: 实现 `SkillsTable.tsx`**

对齐 `WorksTable` 的 `<table className="w-full">` 风格：

```tsx
"use client";

import { Github, RefreshCw, Trash2, Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SkillRow } from "./types";

export function SkillsTable({
  skills,
  onToggle,
  onUpdate,
  onMount,
  onDelete,
}: {
  skills: SkillRow[];
  onToggle: (name: string, enabled: boolean) => void;
  onUpdate: (skill: SkillRow) => void;
  onMount: (skill: SkillRow) => void;
  onDelete: (skill: SkillRow) => void;
}) {
  if (skills.length === 0) {
    return (
      <div className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
        暂无已安装的 Skill
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b text-xs text-muted-foreground bg-background">
            <th className="text-left font-medium py-2 pl-4">名称</th>
            <th className="text-left font-medium py-2 w-20">版本</th>
            <th className="text-left font-medium py-2">描述</th>
            <th className="text-left font-medium py-2 w-28">协议</th>
            <th className="text-left font-medium py-2 w-12">源</th>
            <th className="text-left font-medium py-2 w-24">commit</th>
            <th className="text-left font-medium py-2 w-16">启用</th>
            <th className="text-left font-medium py-2 pr-4 w-40">操作</th>
          </tr>
        </thead>
        <tbody>
          {skills.map((s) => (
            <tr key={s.name} className="border-b last:border-0 text-sm">
              <td className="py-2 pl-4 font-medium">{s.name}</td>
              <td className="py-2 text-muted-foreground">v{s.version}</td>
              <td className="py-2 max-w-xs truncate text-muted-foreground" title={s.description}>
                {s.description}
              </td>
              <td className="py-2 text-muted-foreground">{s.license ?? "—"}</td>
              <td className="py-2">
                {s.sourceUrl ? (
                  <a
                    href={s.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex text-muted-foreground hover:text-foreground"
                    title={s.sourceUrl}
                  >
                    <Github className="h-4 w-4" />
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2 font-mono text-xs text-muted-foreground" title={s.commit ?? undefined}>
                {s.commitShort ?? "—"}
              </td>
              <td className="py-2">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={() => onToggle(s.name, s.enabled)}
                  className="h-3.5 w-3.5 accent-primary"
                  title={s.enabled ? "点击禁用" : "点击启用"}
                />
              </td>
              <td className="py-2 pr-4">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => onUpdate(s)} title="更新">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => onMount(s)} title="挂载">
                    <Cable className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(s)}
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

（若 `size="icon-sm"` 在本地 Button 变体不存在，改用 `size="sm"` + className。）

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/skills/types.ts src/app/settings/skills/SkillsTable.tsx
git commit -m "feat(skills): add SkillsTable component"
```

---

### Task 5: InstallSkillDialog 三步向导

**Files:**
- Create: `src/app/settings/skills/InstallSkillDialog.tsx`

**Interfaces:**
- Consumes: `POST /api/skills` `{ url, force? }` → `{ success, batch }`；`POST /api/skills/staging/:id/review`；`POST .../publish` `{ names, overwrite? }`；`DELETE /api/skills/:batchId` 放弃
- Produces: 弹窗完成时 `onInstalled()`

- [ ] **Step 1: 实现向导组件**

关键结构：

```tsx
"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Step = 1 | 2 | 3;

export function InstallSkillDialog({
  open,
  onOpenChange,
  onInstalled,
  mode = "create",
  initialUrl = "",
  overwrite = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: () => void;
  mode?: "create" | "update";
  initialUrl?: string;
  overwrite?: boolean;
}) {
  const [step, setStep] = useState<Step>(1);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, setBatch] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // open / initialUrl 变化时重置
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setUrl(initialUrl);
    setBusy(false);
    setError("");
    setBatchId(null);
    setBatch(null);
    setSelected(new Set());
  }, [open, initialUrl]);

  async function startInstall() {
    if (!url.trim()) return;
    setBusy(true);
    setError("");
    setStep(2);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          force: mode === "update" || true, // 更新模式必须 force；新建也 force 清掉残留同名 staging 更顺滑
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "下载/审查失败");
        setStep(1);
        return;
      }
      setBatch(data.batch);
      setBatchId(data.batch.batchId);
      const names = (data.batch.candidates ?? []).map((c: { name: string }) => c.name);
      setSelected(new Set(names));
      if (data.batch.review?.verdict === "pass") {
        setStep(3);
      } else {
        // 停在 step2 展示失败
        setStep(2);
      }
    } catch {
      setError("网络错误");
      setStep(1);
    } finally {
      setBusy(false);
    }
  }

  async function reReview() {
    if (!batchId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/skills/staging/${batchId}/review`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "审查失败");
        return;
      }
      // 重新拉 staging 详情：用 list 或 review 返回值
      const st = await fetch("/api/skills/staging");
      const stData = await st.json();
      const b = (stData.staging ?? []).find((x: any) => x.batchId === batchId);
      if (b) {
        setBatch(b);
        if (b.review?.verdict === "pass") {
          setSelected(new Set(b.candidates.map((c: any) => c.name)));
          setStep(3);
        }
      }
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!batchId) return;
    const names = Array.from(selected);
    if (names.length === 0) {
      setError("请至少选择一个 Skill");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/skills/staging/${batchId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          names,
          overwrite: overwrite || mode === "update",
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "安装失败");
        return;
      }
      if (data.errors?.length) {
        // 部分成功：仍关闭并刷新，错误用 alert
        alert(data.errors.join("\n"));
      }
      onOpenChange(false);
      onInstalled();
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function discardAndClose() {
    if (batchId) {
      await fetch(`/api/skills/${batchId}`, { method: "DELETE" });
    }
    onOpenChange(false);
  }

  // UI: Dialog + 步骤指示 1-2-3 + 按 step 渲染
  // 警告条固定在 DialogHeader 下方
  // ...
}
```

**force 策略（实现时写死）：**
- `mode === "update"` → `force: true`，`overwrite: true`
- `mode === "create"` → `force: true`（避免残留 staging 挡道；与「已在暂存区」死锁相比，向导内 force 更合理）

**步骤条 UI（无组件库）：**

```tsx
function Stepper({ step }: { step: Step }) {
  const labels = ["来源", "审查", "安装"];
  return (
    <div className="flex items-center gap-2 text-xs mb-4">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={
                "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] " +
                (active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-primary text-primary"
                    : "text-muted-foreground")
              }
            >
              {n}
            </div>
            <span className={active ? "font-medium" : "text-muted-foreground"}>
              {label}
            </span>
            {i < labels.length - 1 && (
              <div className="mx-1 h-px w-6 bg-border" />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

警告：

```tsx
<div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
  <span>
    安装 Skill 即引入可执行代码，请仅从信任来源安装。Skill
    代码在服务器本机执行，可读取 Skill 文件但无宿主环境变量。
  </span>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/skills/InstallSkillDialog.tsx
git commit -m "feat(skills): add three-step install wizard dialog"
```

---

### Task 6: MountSkillDialog

**Files:**
- Create: `src/app/settings/skills/MountSkillDialog.tsx`

**Interfaces:**
- Consumes: `mounts: Record<string, string[]>`，`agentKeys`，`skillName`
- Produces: 确认时 `onSave(nextMounts)`

- [ ] **Step 1: 实现**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function MountSkillDialog({
  open,
  onOpenChange,
  skillName,
  mounts,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  skillName: string;
  mounts: Record<string, string[]>;
  onSave: (next: Record<string, string[]>) => Promise<void>;
}) {
  const agentKeys = Object.keys(mounts);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const init = new Set(
      agentKeys.filter((ak) => (mounts[ak] ?? []).includes(skillName))
    );
    setSelected(init);
  }, [open, skillName, mounts]); // mounts 引用变化时重置

  async function confirm() {
    setBusy(true);
    try {
      const next = { ...mounts };
      for (const ak of agentKeys) {
        const set = new Set(next[ak] ?? []);
        if (selected.has(ak)) set.add(skillName);
        else set.delete(skillName);
        next[ak] = Array.from(set);
      }
      await onSave(next);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>挂载到 Agent</DialogTitle>
          <DialogDescription>
            选择要挂载 Skill「{skillName}」的 Agent（仍需在表格中启用该 Skill 才会注入）
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {agentKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无 Agent 挂载配置</p>
          ) : (
            agentKeys.map((ak) => (
              <label key={ak} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={selected.has(ak)}
                  onChange={() => {
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (n.has(ak)) n.delete(ak);
                      else n.add(ak);
                      return n;
                    });
                  }}
                />
                {ak}
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={confirm} disabled={busy}>
            {busy ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/skills/MountSkillDialog.tsx
git commit -m "feat(skills): add mount-to-agent dialog"
```

---

### Task 7: 页面壳 page.tsx 接线

**Files:**
- Rewrite: `src/app/settings/skills/page.tsx`

**Interfaces:**
- 组合 Task 4–6 组件；拉取 `/api/skills` 与 `/api/skills/mounts`

- [ ] **Step 1: 重写页面**

要点：

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { SkillsTable } from "./SkillsTable";
import { InstallSkillDialog } from "./InstallSkillDialog";
import { MountSkillDialog } from "./MountSkillDialog";
import type { SkillRow } from "./types";

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [mounts, setMounts] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [installOpen, setInstallOpen] = useState(false);
  const [installMode, setInstallMode] = useState<"create" | "update">("create");
  const [installUrl, setInstallUrl] = useState("");
  const [mountTarget, setMountTarget] = useState<SkillRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SkillRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [sRes, mRes] = await Promise.all([
      fetch("/api/skills"),
      fetch("/api/skills/mounts"),
    ]);
    const sData = await sRes.json();
    const mData = await mRes.json();
    if (sData.success) setSkills(sData.skills);
    if (mData.success) setMounts(mData.mounts);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // onToggle → PATCH
  // onUpdate → check-update → 无更新 setMessage；有更新 setInstallMode('update') + url + open
  // onMount → setMountTarget
  // onDelete → setDeleteTarget → confirm DELETE

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Skills</h2>
        <Button
          size="sm"
          onClick={() => {
            setInstallMode("create");
            setInstallUrl("");
            setInstallOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          添加 Skill
        </Button>
      </div>

      {message && (
        <div className="rounded-md bg-muted p-2 text-sm">{message}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <SkillsTable
          skills={skills}
          onToggle={/* ... */}
          onUpdate={/* ... */}
          onMount={setMountTarget}
          onDelete={setDeleteTarget}
        />
      )}

      <InstallSkillDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        onInstalled={refresh}
        mode={installMode}
        initialUrl={installUrl}
        overwrite={installMode === "update"}
      />

      {mountTarget && (
        <MountSkillDialog
          open={!!mountTarget}
          onOpenChange={(v) => !v && setMountTarget(null)}
          skillName={mountTarget.name}
          mounts={mounts}
          onSave={async (next) => {
            await fetch("/api/skills/mounts", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mounts: next }),
            });
            setMounts(next);
          }}
        />
      )}

      {/* 删除确认 Dialog，同现有模式 */}
    </div>
  );
}
```

**更新处理：**

```ts
async function handleUpdate(skill: SkillRow) {
  const res = await fetch(`/api/skills/${skill.name}/check-update`, {
    method: "POST",
  });
  const data = await res.json();
  if (!data.success) {
    setMessage(data.error || "检查更新失败");
    return;
  }
  if (!data.hasUpdate) {
    setMessage("已是最新");
    return;
  }
  setMessage(`发现新版本 ${data.latestVersion}，请在向导中安装`);
  setInstallMode("update");
  setInstallUrl(skill.sourceUrl);
  setInstallOpen(true);
}
```

- [ ] **Step 2: 本地冒烟清单**

1. `pnpm dev`，打开 `/settings/skills`
2. 若存在幽灵 `a-stock-data` → 列表应显示（migrate）
3. 删除 → 列表空
4. 添加 Skill → 三步完成 → 表格有行，协议/commit 有值或 `—`
5. 更新 → 已是最新 or 向导覆盖
6. 挂载 → 勾选 evaluatorAgent → 刷新后仍在
7. 禁用/启用 → 状态正确
8. `pnpm test tests/skills-service.test.ts` 仍 PASS
9. `pnpm lint` 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/skills/
git commit -m "feat(skills): redesign skills page with table and install wizard"
```

---

### Task 8: 收尾自检

- [ ] **Step 1: 对照 spec 清单**

| Spec 项 | Task |
|---|---|
| publish → `.meta.json` | Task 1 |
| 幽灵 migrate | Task 1 |
| license/commit 落盘 | Task 1 |
| overwrite 发布 | Task 1 + 3 |
| force staging | Task 1 + 3 |
| 删 skill 清 mounts | Task 2 |
| 表格 + toolbar | Task 4 + 7 |
| 三步向导 + 警告在弹窗 | Task 5 |
| 挂载弹窗 | Task 6 |
| 更新走检查+向导 | Task 7 |

- [ ] **Step 2: 跑全量相关验证**

```bash
pnpm test tests/skills-service.test.ts
pnpm lint
```

- [ ] **Step 3: 若有文档需改**

无需改 CLAUDE.md（行为属内部服务）。spec 已存在。

---

## Self-Review (plan author)

1. **Spec coverage:** §1–§9 均有对应 Task；附属文件 LICENSE 拷贝在 Task 1 publish 中；DEFAULT_MOUNTS 未改。
2. **Placeholders:** 页面 wiring 用注释标了 handler 位置，但行为在同 task 的「更新处理」代码块写全；实现者不得省略。
3. **Types:** `publishCandidates` 返回值统一为 `{ published, errors }`，不再 throw 部分失败；API 409 仅当 published 空。
4. **ESM 测试注意:** vitest 下优先依赖惰性 `skillsRoot()` + 静态 import，避免 `require.cache`。
5. **create 模式 force:** 写死 `force: true` 以清残留 staging，与 spec「推荐 force」一致。
