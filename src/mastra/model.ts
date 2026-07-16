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
    // OpenAICompatibleConfig 的 { providerId, modelId } 变体：
    // 设置了 url 时 Mastra 直接走 openai-compatible 通道（baseURL=url，模型名原样透传），
    // providerId 仅作标识；settings 中的模型 id 不含 "/"，无法用 `${string}/${string}` 形式的 id 字段。
    return {
      providerId: "newapi",
      modelId,
      url: process.env.NEWAPI_BASE_URL || DEFAULT_NEWAPI_BASE_URL,
      apiKey,
    };
  };
}
