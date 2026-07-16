// src/services/settings-service.ts
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_LLM_MODEL } from "@/lib/llm";

export async function getSetting(key: string): Promise<string | null> {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  db.insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: now },
    })
    .run();
}

export type LlmFlow = "opinion" | "evaluation";

export const LLM_MODEL_KEYS: Record<LlmFlow, string> = {
  opinion: "llm_model_opinion",
  evaluation: "llm_model_evaluation",
};

/** 读取某流程配置的 LLM 模型，未设置时返回默认模型 */
export async function getLlmModel(flow: LlmFlow): Promise<string> {
  const value = await getSetting(LLM_MODEL_KEYS[flow]);
  return value || DEFAULT_LLM_MODEL;
}
