# Mastra 基座 + LLM 场景 Agent 化 实现计划（子项目 1/4）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 AI 底层从直连 `@anthropic-ai/sdk` 迁移到 Mastra：引入 `@mastra/core`、接通 newapi（动态读 settings 表选模型）、观点提取 Agent 化、删除 Anthropic SDK，对外行为完全不变。

**Architecture:** `src/mastra/` 目录承载 Mastra 实例与 agents；`model.ts` 的 `newapiModel(flow)` 是全项目唯一模型解析入口（返回异步函数，运行时读 settings 返回内联 OpenAI 兼容配置 `{ url, id, apiKey }`）；`opinion-service` 改调 opinion agent 的 `generate`，行为合同（失败返回空串）不变。

**Tech Stack:** Next.js 16.2.10 App Router、@mastra/core 1.x（2026-01 发布 1.0）、zod、newapi OpenAI 兼容网关。

**Spec:** `docs/superpowers/specs/2026-07-16-mastra-foundation-design.md`

## Global Constraints

- **Next.js 16.2.10 有 breaking changes**：写 Next.js 相关代码前先读 `node_modules/next/dist/docs/01-app/` 下对应指南。
- **Mastra API 以本地安装版本为准**：本计划代码按 Mastra 1.x 文档编写；若 `npx tsc --noEmit` 报 Mastra 类型不匹配，以 `node_modules/@mastra/core/dist/**/*.d.ts` 的实际类型为准做最小调整（保持 spec 行为不变），并在报告中说明调整点。
- 项目**没有测试框架**，不新增。每任务验证 = `npx tsc --noEmit` + `npm run lint` 通过 + 指定冒烟步骤。
- settings 表继续存**裸模型名**（如 `claude-sonnet-4-20250514`），零迁移；`settings-service` 对外接口（`getLlmModel(flow)` 等）不变。
- `extractOpinion` 行为合同不变：空/空白转写返回 `""`；任何失败 `console.error` + 返回 `""`，绝不抛出；采样参数 maxTokens 200 / temperature 0.3 / 输入截断 4000。
- 环境变量仍只用 `NEWAPI_API_KEY`、`NEWAPI_BASE_URL`；`NEWAPI_API_KEY` 缺失时抛 `"NEWAPI_API_KEY environment variable is not set"`。
- 本期不引入 Mastra storage/memory/Studio/@mastra/ai-sdk；不动 evaluator stub、pipeline 结构、settings API/UI。
- 中文注释，风格与现有代码一致。

---

### Task 1: 安装依赖 + Next 构建配置

**Files:**
- Modify: `package.json`（经 npm 命令）
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: 无
- Produces: `@mastra/core`、`zod` 可 import；Next 构建将 `@mastra/*` 视为 server external

- [ ] **Step 1: 安装依赖**

Run: `npm install @mastra/core@latest zod@latest`
Expected: 安装成功，`package.json` dependencies 出现 `@mastra/core` 与 `zod`。

- [ ] **Step 2: 修改 next.config.ts**

整文件改为：

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mastra 依赖 Node-only 模块，必须排除出打包
  serverExternalPackages: ["@mastra/*"],
};

export default nextConfig;
```

（如对该配置项有疑问，见 `node_modules/next/dist/docs/01-app/` 下 api-reference 中 next-config 相关文档；Mastra 官方 Next.js 指南要求此配置。）

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功，无新错误。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json next.config.ts
git commit -m "chore: 引入 @mastra/core 与 zod，配置 serverExternalPackages"
```

---

### Task 2: Mastra 基座 — 动态模型工厂 + opinion agent + 实例注册

**Files:**
- Create: `src/mastra/model.ts`
- Create: `src/mastra/agents/opinion-agent.ts`
- Create: `src/mastra/index.ts`

**Interfaces:**
- Consumes: `getLlmModel(flow: LlmFlow): Promise<string>`、`type LlmFlow = "opinion" | "evaluation"`（`@/services/settings-service`）；`DEFAULT_NEWAPI_BASE_URL`（`@/lib/llm-constants`）；`Agent`（`@mastra/core/agent`）、`Mastra`（`@mastra/core`）
- Produces（Task 3 依赖）:
  - `newapiModel(flow: LlmFlow)` — 返回 Mastra Agent 可用的异步 model 函数
  - `opinionAgent`（注册名 `opinionAgent`）— instructions 为原 SYSTEM_PROMPT
  - `mastra` 实例（`@/mastra`），`mastra.getAgent("opinionAgent")` 可用

- [ ] **Step 1: 创建动态模型工厂**

创建 `src/mastra/model.ts`：

```ts
// src/mastra/model.ts
import { getLlmModel, type LlmFlow } from "@/services/settings-service";
import { DEFAULT_NEWAPI_BASE_URL } from "@/lib/llm-constants";

/**
 * newapi 动态模型工厂：返回 Mastra Agent 的异步 model 函数，
 * 每次请求时读取 settings 表中该流程配置的模型（未设置时兜底默认模型）。
 * 全项目 agent 统一从这里取模型。
 */
export function newapiModel(flow: LlmFlow) {
  return async () => {
    const apiKey = process.env.NEWAPI_API_KEY;
    if (!apiKey) {
      throw new Error("NEWAPI_API_KEY environment variable is not set");
    }
    const modelId = await getLlmModel(flow);
    return {
      url: process.env.NEWAPI_BASE_URL || DEFAULT_NEWAPI_BASE_URL,
      id: modelId,
      apiKey,
    };
  };
}
```

- [ ] **Step 2: 创建 opinion agent**

创建 `src/mastra/agents/opinion-agent.ts`（instructions 为 `src/services/douyin/opinion-service.ts` 中 SYSTEM_PROMPT 一字不改的迁移）：

```ts
// src/mastra/agents/opinion-agent.ts
import { Agent } from "@mastra/core/agent";
import { newapiModel } from "@/mastra/model";

const INSTRUCTIONS = `你是一个财经内容分析师。用户会给你一段抖音博主的口播转写文本，请你用一句话（不超过80字）总结该博主的观点或判断。

要求：
1. 只返回一句话总结，不要任何额外解释
2. 如果文本中包含具体的预测判断（涨跌、点位、时间），必须包含在总结中
3. 如果是纯技术分析类内容（K线形态、指标解读等），请概括其核心论点
4. 如果文本内容与投资无关，返回"非投资相关内容"
5. 直接返回总结文字，不要JSON格式`;

export const opinionAgent = new Agent({
  name: "opinion-agent",
  instructions: INSTRUCTIONS,
  model: newapiModel("opinion"),
});
```

- [ ] **Step 3: 创建 Mastra 实例**

创建 `src/mastra/index.ts`：

```ts
// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { opinionAgent } from "@/mastra/agents/opinion-agent";

export const mastra = new Mastra({
  agents: { opinionAgent },
});
```

- [ ] **Step 4: 类型检查与 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误。若 Mastra 类型不匹配（如 Agent 构造字段、model 函数签名、内联配置字段名），按 Global Constraints 以 `node_modules/@mastra/core/dist` 实际类型为准做最小调整并在报告中说明。

- [ ] **Step 5: Commit**

```bash
git add src/mastra/
git commit -m "feat: Mastra 基座 — newapi 动态模型工厂与 opinion agent"
```

---

### Task 3: 切换 opinion-service 到 Mastra + 清理 Anthropic SDK

**Files:**
- Modify: `src/services/douyin/opinion-service.ts`（整文件重写，见 Step 1）
- Modify: `src/services/settings-service.ts`（改一行 import）
- Delete: `src/lib/llm.ts`
- Modify: `package.json`（经 npm 命令卸载 @anthropic-ai/sdk）

**Interfaces:**
- Consumes: `mastra`（`@/mastra`，Task 2）；`agent.generate(prompt, { modelSettings: { maxOutputTokens, temperature } })` 返回含 `.text` 的结果
- Produces: `extractOpinion(transcript: string): Promise<string>` 签名与行为不变（pipeline-service.ts:116 的调用方无需改动）

- [ ] **Step 1: 重写 opinion-service**

`src/services/douyin/opinion-service.ts` 整文件改为：

```ts
// src/services/douyin/opinion-service.ts
import { mastra } from "@/mastra";

export async function extractOpinion(transcript: string): Promise<string> {
  if (!transcript || transcript.trim().length === 0) {
    return "";
  }

  try {
    const agent = mastra.getAgent("opinionAgent");
    const result = await agent.generate(
      transcript.slice(0, 4000), // 限制输入长度
      { modelSettings: { maxOutputTokens: 200, temperature: 0.3 } }
    );
    return result.text.trim();
  } catch (err) {
    console.error("[opinion] LLM 提取观点失败:", err);
    return "";
  }
}
```

（系统提示词已迁入 opinion agent 的 instructions，此文件不再保留。）

- [ ] **Step 2: settings-service 改 import**

`src/services/settings-service.ts` 中：

```ts
import { DEFAULT_LLM_MODEL } from "@/lib/llm";
```

改为：

```ts
import { DEFAULT_LLM_MODEL } from "@/lib/llm-constants";
```

- [ ] **Step 3: 确认 llm.ts 无其他引用后删除**

Run: `grep -rn "@/lib/llm\"" src/ --include="*.ts" --include="*.tsx"`
Expected: 无任何输出（`@/lib/llm-constants` 的引用带 `-constants` 后缀，不会匹配 `@/lib/llm"`）。

然后删除：

```bash
rm src/lib/llm.ts
```

- [ ] **Step 4: 卸载 Anthropic SDK**

Run: `npm uninstall @anthropic-ai/sdk`
Expected: `package.json` 中 `@anthropic-ai/sdk` 消失。

- [ ] **Step 5: 类型检查、lint、构建**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 均通过，无新错误。

- [ ] **Step 6: Commit**

```bash
git add src/services/douyin/opinion-service.ts src/services/settings-service.ts src/lib/llm.ts package.json package-lock.json
git commit -m "feat: 观点提取切换到 Mastra opinion agent，移除 @anthropic-ai/sdk"
```

---

### Task 4: 整体验证（端到端冒烟）

**Files:** 无新增/修改（纯验证）

- [ ] **Step 1: 启动并冒烟设置页**

dev server（若未运行则 `npm run dev` 后台启动）：

```bash
curl -s http://localhost:3000/settings -o /dev/null -w "%{http_code}"
curl -s http://localhost:3000/api/settings/llm
curl -s http://localhost:3000/api/llm/models | head -c 200
```

Expected: 200；`{"opinionModel":"...","evaluationModel":"..."}`；`{"models":[...]}`。

- [ ] **Step 2: 端到端转写冒烟（真实 LLM 调用）**

1. 设置页确认「观点提取模型」当前值
2. `curl -s -X POST http://localhost:3000/api/douyin/transcribe -H "Content-Type: application/json" -d '{"maxTasks":1}'`（需存在待转写作品；没有则先 `curl -s -X POST http://localhost:3000/api/douyin/scan`）
3. Expected: 返回 `{"total":...,"done":...}`，对应作品的 `opinionSummary` 非空写入
4. 在 newapi 后台日志核对：本次请求走 `/v1/chat/completions`，模型与设置页所选一致

- [ ] **Step 3: 动态模型验证**

设置页把「观点提取模型」切到另一个模型 → 再触发一条转写 → newapi 日志确认模型已切换（服务无需重启）。验证后切回原值。

- [ ] **Step 4: 收尾**

`git status` 干净，所有任务勾选完成。
