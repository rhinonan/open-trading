// src/lib/llm-log.ts
// LLM / Workflow 结构化日志最小合同（P0-2）。
// 一行一条 JSON，便于 grep / 后续挂 Langfuse·OTel exporter。
// 禁止写入 apiKey、完整用户隐私转写正文。

export type LlmLogLevel = "debug" | "info" | "warn" | "error";

/** 字段合同：未用到的键省略，勿填空字符串占位 */
export interface LlmLogFields {
  event: string;
  runId?: string;
  workId?: number | string;
  awemeId?: string;
  batchId?: string;
  agentKey?: string;
  workflowId?: string;
  stepId?: string;
  model?: string;
  latencyMs?: number;
  status?: string;
  error?: string;
  [key: string]: unknown;
}

export interface LlmLogRecord extends LlmLogFields {
  ts: string;
  level: LlmLogLevel;
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** 写出一条 JSON 日志；error 级走 console.error，其余 console.log */
export function llmLog(level: LlmLogLevel, fields: LlmLogFields): void {
  const { event, ...rest } = fields;
  const record: LlmLogRecord = {
    ts: new Date().toISOString(),
    level,
    event,
    ...rest,
  };
  // 防御：绝不把疑似密钥字段打出去
  for (const k of Object.keys(record)) {
    if (/api[_-]?key|secret|password|authorization/i.test(k)) {
      delete (record as Record<string, unknown>)[k];
    }
  }
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function llmLogError(
  fields: Omit<LlmLogFields, "error"> & { error?: unknown },
): void {
  const { error, ...rest } = fields;
  const payload: LlmLogFields = {
    ...(rest as LlmLogFields),
    error: error === undefined ? undefined : safeErrorMessage(error),
  };
  llmLog("error", payload);
}

/** 计时辅助：返回 elapsedMs() */
export function startTimer(): { elapsedMs: () => number } {
  const t0 = Date.now();
  return { elapsedMs: () => Date.now() - t0 };
}
