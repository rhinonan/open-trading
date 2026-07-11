// src/services/douyin/evaluator-service.ts
import { db } from "@/db";
import { bloggers, works, evaluations, predictionItems } from "@/db/schema";
import { eq, and, isNull, gte, desc } from "drizzle-orm";
import { callClaude, parseClaudeJson } from "@/lib/llm";
import { getMarketSnapshot } from "./market-snapshot";
import type {
  DouyinBlogger,
  DouyinWork,
  MarketSnapshot,
  PredictionType,
} from "@/types";

const EVALUATION_PROMPT = `你是A股市场分析专家。请根据今天的实际行情数据和博主的视频文案，完成以下任务：

1. 从文案中提取所有明确的行情预测（模糊观点忽略）
2. 根据今天的实际行情，逐一判断每条预测是否正确
3. 综合评估该博主今天的预测准确率（0-100）

注意：
- 只判断已经可以验证的预测（如果博主的预测需要更长时间验证，is_correct 设为 null）
- accuracy_score 只计入已明确可判的条目
- prediction_type 必须是 market_direction / index_level / sector / stock_pick 之一
- 对于 "market_direction"，方向正确（涨/跌）即正确
- 对于 "sector"，该板块今天涨幅排前列（前20）可视为走强
- 对于 "stock_pick"，个股涨幅跑赢大盘可视为短期正确，到达目标价才完全正确

返回严格JSON（不要markdown代码块包裹）：
{
  "worksCount": 3,
  "predictionSummary": "今日共提取3条预测，大盘方向正确，个股推荐1条待验证",
  "accuracyScore": 67,
  "items": [
    {
      "predictedContent": "明天大盘大概率红盘",
      "predictionType": "market_direction",
      "predictionTarget": "大盘",
      "predictionDetail": { "direction": "up" },
      "isCorrect": 1,
      "judgment": "今日上证+0.8%，预测正确",
      "relatedSymbols": []
    }
  ]
}`;

interface LLMEvalItem {
  predictedContent: string;
  predictionType: PredictionType;
  predictionTarget: string;
  predictionDetail: Record<string, unknown>;
  isCorrect: number | null;
  judgment: string;
  relatedSymbols: string[];
}

interface LLMEvalResult {
  worksCount: number;
  predictionSummary: string;
  accuracyScore: number;
  items: LLMEvalItem[];
}

export interface EvaluationResult {
  bloggerId: number;
  nickname: string;
  evalDate: string;
  worksCount: number;
  predictionSummary: string;
  accuracyScore: number;
  itemsCount: number;
  error?: string;
}

export async function evaluateAllBloggers(
  evalDate?: string
): Promise<EvaluationResult[]> {
  const predictorBloggers = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.category, "predictor"))
    .all() as DouyinBlogger[];

  const results: EvaluationResult[] = [];
  for (const blogger of predictorBloggers) {
    results.push(await evaluateBlogger(blogger.id, evalDate));
  }

  return results;
}

export async function evaluateBlogger(
  bloggerId: number,
  evalDate?: string
): Promise<EvaluationResult> {
  const date = evalDate || new Date().toISOString().slice(0, 10);

  const blogger = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.id, bloggerId))
    .get() as DouyinBlogger | undefined;

  const result: EvaluationResult = {
    bloggerId,
    nickname: blogger?.nickname || "unknown",
    evalDate: date,
    worksCount: 0,
    predictionSummary: "",
    accuracyScore: 0,
    itemsCount: 0,
  };

  if (!blogger) {
    result.error = "Blogger not found";
    return result;
  }

  // Get unevaluated works from the last 7 days
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const recentWorks = db
    .select()
    .from(works)
    .where(
      and(
        eq(works.bloggerId, bloggerId),
        gte(works.publishedAt, sevenDaysAgo)
      )
    )
    .orderBy(desc(works.publishedAt))
    .all() as DouyinWork[];

  if (recentWorks.length === 0) return result;

  result.worksCount = recentWorks.length;

  // Get market snapshot
  let marketSnapshot: MarketSnapshot;
  try {
    marketSnapshot = await getMarketSnapshot(date);
  } catch {
    marketSnapshot = {
      date,
      indices: {
        shanghai: { close: 0, change: 0, changePercent: 0 },
        shenzhen: { close: 0, change: 0, changePercent: 0 },
        chinext: { close: 0, change: 0, changePercent: 0 },
      },
      topSectors: [],
      bottomSectors: [],
    };
  }

  // Build the LLM input
  const marketSection = `今日行情数据：\n${JSON.stringify(
    marketSnapshot,
    null,
    2
  )}`;

  const worksSection = recentWorks
    .map(
      (w, i) =>
        `[作品${i + 1}] 发布时间: ${new Date(w.publishedAt * 1000)
          .toISOString()
          .slice(0, 10)}\ndesc: ${w.desc}\ntranscript: ${
          w.transcript || "(未转写)"
        }`
    )
    .join("\n\n");

  const userMessage = `${marketSection}\n\n---\n\n以下是博主 ${
    blogger.nickname
  } 在近期发布的视频文案：\n\n${worksSection}`;

  try {
    const llmResponse = await callClaude(userMessage, EVALUATION_PROMPT);
    const evalResult = parseClaudeJson<LLMEvalResult>(llmResponse);

    result.predictionSummary = evalResult.predictionSummary;
    result.accuracyScore = evalResult.accuracyScore;
    result.itemsCount = evalResult.items.length;

    // Save evaluation
    const evaluation = db
      .insert(evaluations)
      .values({
        bloggerId,
        evalDate: date,
        worksCount: recentWorks.length,
        predictionSummary: evalResult.predictionSummary,
        accuracyScore: evalResult.accuracyScore,
        evalDetail: JSON.stringify(evalResult),
        marketSnapshot: JSON.stringify(marketSnapshot),
      })
      .returning()
      .get();

    const evalId = (evaluation as any).id as number;

    // Save prediction items
    for (const item of evalResult.items) {
      db.insert(predictionItems)
        .values({
          evaluationId: evalId,
          workId: recentWorks[0]?.id || 0, // best-effort linking to first work
          predictedContent: item.predictedContent,
          predictionType: item.predictionType,
          predictionTarget: item.predictionTarget,
          predictionDetail: JSON.stringify(item.predictionDetail),
          isCorrect: item.isCorrect,
          judgment: item.judgment,
          relatedSymbols: JSON.stringify(item.relatedSymbols),
        })
        .run();
    }
  } catch (err) {
    result.error =
      err instanceof Error ? err.message : "Evaluation failed";
  }

  return result;
}
