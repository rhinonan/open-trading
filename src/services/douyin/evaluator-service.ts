// src/services/douyin/evaluator-service.ts
// ============================================================================
// TODO: 重新启用 evaluator
//
// 当前阶段上游 pipeline（下载视频 → 提取音频 → ASR 转文本）尚未实现，
// 所有 works.transcript 为空，无法进行 LLM 评判。暂时返回空结果。
//
// 完整流程：
//   1. 获取当日行情快照（market-snapshot.ts）
//   2. 拉取博主近期作品（含 transcript）
//   3. 汇总 → LLM 评判 → 写入 evaluations + prediction_items
// ============================================================================

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
  _evalDate?: string
): Promise<EvaluationResult[]> {
  // TODO: 等 ASR pipeline 就绪后实现
  return [];
}

export async function evaluateBlogger(
  _bloggerId: number,
  _evalDate?: string
): Promise<EvaluationResult> {
  // TODO: 等 ASR pipeline 就绪后实现
  return {
    bloggerId: _bloggerId,
    nickname: "unknown",
    evalDate: _evalDate || new Date().toISOString().slice(0, 10),
    worksCount: 0,
    predictionSummary: "评判功能暂未启用（需先实现 ASR pipeline）",
    accuracyScore: 0,
    itemsCount: 0,
  };
}
