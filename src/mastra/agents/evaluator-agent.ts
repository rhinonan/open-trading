// src/mastra/agents/evaluator-agent.ts
import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { Agent } from "@mastra/core/agent";
import { Workspace, LocalFilesystem, LocalSandbox } from "@mastra/core/workspace";
import { newapiModel } from "@/mastra/model";
import { resolveAgentSkills } from "@/mastra/resolve-skills";
import { marketTools } from "@/mastra/tools/market-tools";
import { dataPath } from "@/lib/data-root";

// 探测可用 python 命令（dev：python，容器：python3）
function detectPython(): string {
  for (const cmd of ["python3", "python"]) {
    try {
      execSync(`${cmd} --version`, { stdio: "ignore", timeout: 3000 });
      return cmd;
    } catch {
      /* continue */
    }
  }
  return "python3"; // fallback
}

const pythonCmd = detectPython();
const workspaceDir = dataPath("workspace", "evaluator");

// 确保工作区目录存在
mkdirSync(workspaceDir, { recursive: true });

const EVALUATOR_INSTRUCTIONS = `你是 A 股行情评判专家。给定抖音博主口播转写文本，你需要：

1. 从转录中提取所有可验证的行情预测/判断（一作品可能有多条）
2. 对每条预测，根据数据判定其正确性

## 判定标准

- correct: 预测方向与实际完全一致，幅度偏差 ≤ 20%
- mostly_correct: 方向正确但幅度偏差 > 20%
- incorrect: 方向错误
- not_yet: 预测期限尚未到达（如 6 个月后见底，现在只过了 2 个月），必须给出 verifiableAfter 日期
- not_applicable: 内容不涉及行情预测或无法验证（纯闲聊、纯技术分析无方向等）

## 期限口径（重要，保持一致）

- 「短期/近期」→ 发布日后 5 个交易日
- 「中期」→ 发布日后 30 个自然日
- 「长期」或「N 个月后」但无具体可验证标的 → 倾向 not_applicable（不挂永远的 not_yet）
- 有方向、有标的、有明确时间（如「年底前见 4000 点」）→ not_yet + verifiableAfter

## 数据获取（优先 Typed Tools）

优先调用内置 tools，不要先写脚本：
- getStockQuote：实时/日级报价（腾讯，个股/指数/ETF）
- getIndexKline：日 K 开高低收（东财前复权；发布日前后区间用 beg/end）
- getSectorRank：行业板块涨跌排名（东财）

仅当上述 tools 无法覆盖（龙虎榜、研报、北向明细等）时，再按 skill（a-stock-data）用 ${pythonCmd} 在工作目录 ${workspaceDir} 执行脚本（超时 120 秒）。东财 HTTP 须限流，勿并发狂刷。

## evidence

每次判定必须在 evidence 记录实际取到的关键数据点：
- 优先填：symbol、rangeStart/rangeEnd、openPrice/closePrice、changePercent、source、fetchedAt
- source 写 tool 返回的 source（tencent / eastmoney）或脚本数据源名
- 作者发布日期（视频发布时间）是时间锚点：取发布日附近的数据判断方向

## 输出

严格按照要求的 JSON schema 输出。`;

export const evaluatorAgent = new Agent({
  id: "evaluator-agent",
  name: "evaluator-agent",
  instructions: EVALUATOR_INSTRUCTIONS,
  model: newapiModel("evaluation"),
  tools: marketTools,
  skills: () => resolveAgentSkills("evaluatorAgent"),
  workspace: new Workspace({
    filesystem: new LocalFilesystem({ basePath: workspaceDir }),
    sandbox: new LocalSandbox({
      workingDirectory: workspaceDir,
      timeout: 120_000,
    }),
  }),
});
