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
