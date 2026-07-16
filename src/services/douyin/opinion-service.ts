// src/services/douyin/opinion-service.ts
import { callClaude } from "@/lib/llm";
import { getLlmModel } from "@/services/settings-service";

const SYSTEM_PROMPT = `你是一个财经内容分析师。用户会给你一段抖音博主的口播转写文本，请你用一句话（不超过80字）总结该博主的观点或判断。

要求：
1. 只返回一句话总结，不要任何额外解释
2. 如果文本中包含具体的预测判断（涨跌、点位、时间），必须包含在总结中
3. 如果是纯技术分析类内容（K线形态、指标解读等），请概括其核心论点
4. 如果文本内容与投资无关，返回"非投资相关内容"
5. 直接返回总结文字，不要JSON格式`;

export async function extractOpinion(transcript: string): Promise<string> {
  if (!transcript || transcript.trim().length === 0) {
    return "";
  }

  try {
    const model = await getLlmModel("opinion");
    const result = await callClaude(
      transcript.slice(0, 4000), // 限制输入长度
      SYSTEM_PROMPT,
      { model, maxTokens: 200, temperature: 0.3 }
    );
    return result.trim();
  } catch (err) {
    console.error("[opinion] LLM 提取观点失败:", err);
    return "";
  }
}
