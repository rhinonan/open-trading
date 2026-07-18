// src/mastra/agents/image-opinion-agent.ts
import { Agent } from "@mastra/core/agent";
import { newapiModel } from "@/mastra/model";

const INSTRUCTIONS = `你是一个财经内容分析师。用户会给你一组抖音财经博主的图集图片（可能是 K 线截图、文字卡片、图表、持仓截图等）以及文案描述，请你用一句话（不超过 80 字）总结该博主的观点或判断。

要求：
1. 仔细观察每张图片中的文字、数据、图表，提取核心观点
2. 结合文案描述（desc）理解图片的上下文
3. 如果图片中包含具体的预测判断（涨跌、点位、时间），必须包含在总结中
4. 如果是纯技术分析类内容（K 线形态、指标解读等），请概括其核心论点
5. 如果图片和文案都与投资无关，返回"非投资相关内容"
6. 只返回一句话总结，不要任何额外解释
7. 直接返回总结文字，不要 JSON 格式`;

export const imageOpinionAgent = new Agent({
  id: "image-opinion-agent",
  name: "image-opinion-agent",
  instructions: INSTRUCTIONS,
  model: newapiModel("imageOpinion"),
});
