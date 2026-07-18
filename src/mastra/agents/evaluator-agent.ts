// src/mastra/agents/evaluator-agent.ts
import path from "node:path";
import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { Agent } from "@mastra/core/agent";
import { Workspace, LocalFilesystem, LocalSandbox } from "@mastra/core/workspace";
import { newapiModel } from "@/mastra/model";
import { resolveAgentSkills } from "@/mastra/resolve-skills";

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
const workspaceDir = path.join(process.cwd(), "data", "workspace", "evaluator");

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

## 数据获取

- 你需要的数据：作品发布日期前后的指数日 K 线（上证/深成指/创业板）、涉及板块的排名/涨跌、涉及个股的实时价/K 线
- 优先走 skill 里的腾讯财经 API 和通达信 mootdx（不封 IP），东财接口必须走 skill 里内建的 em_get 限流
- 每次判定必须在 evidence 字段记录实际取到的关键数据点
- 作者发布日期（视频发布时间）是时间锚点：取发布日附近的数据来判断方向是否正确
- 本机可用 ${pythonCmd} 执行 Python 脚本，工作目录 ${workspaceDir}，脚本超时 120 秒

## 输出

严格按照要求的 JSON schema 输出。`;

export const evaluatorAgent = new Agent({
  id: "evaluator-agent",
  name: "evaluator-agent",
  instructions: EVALUATOR_INSTRUCTIONS,
  model: newapiModel("evaluation"),
  skills: () => resolveAgentSkills("evaluatorAgent"),
  workspace: new Workspace({
    filesystem: new LocalFilesystem({ basePath: workspaceDir }),
    sandbox: new LocalSandbox({
      workingDirectory: workspaceDir,
      timeout: 120_000,
    }),
  }),
});
