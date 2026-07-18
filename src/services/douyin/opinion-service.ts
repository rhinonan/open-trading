// src/services/douyin/opinion-service.ts
import * as fs from "fs";
import type { ModelMessage } from "ai";
import { mastra } from "@/mastra";

export async function extractOpinion(
  transcript: string,
  desc?: string
): Promise<string> {
  if (!transcript || transcript.trim().length === 0) {
    return "";
  }

  try {
    const agent = mastra.getAgent("opinionAgent");
    const prompt = buildTextPrompt(transcript, desc);
    const result = await agent.generate(
      prompt.slice(0, 4000), // 限制输入长度
      { modelSettings: { maxOutputTokens: 200, temperature: 0.3 } }
    );
    return result.text.trim();
  } catch (err) {
    console.error("[opinion] LLM 提取观点失败:", err);
    return "";
  }
}

/**
 * 图集观点提取：将本地图片以 base64 多模态消息传给 vision agent。
 * Mastra 会把 AI SDK 的 image part 转成 openai-compatible 的
 * image_url（data:<mediaType>;base64,...）经 newapi 发给 vision 模型。
 * 无图片时退化为对 desc 的纯文本提取；失败返回 ""（非致命，与 extractOpinion 一致）。
 */
export async function extractOpinionFromImages(
  desc: string,
  imagePaths: string[]
): Promise<string> {
  if (imagePaths.length === 0) {
    // 无图片时尝试纯文本从 desc 提取
    if (desc && desc.trim().length > 0) {
      return extractOpinion(desc);
    }
    return "";
  }

  try {
    const agent = mastra.getAgent("imageOpinionAgent");

    const message: ModelMessage = {
      role: "user",
      content: [
        { type: "text", text: buildImagePrompt(desc) },
        ...imagePaths.map((p) => ({
          type: "image" as const,
          image: fs.readFileSync(p).toString("base64"),
          mediaType: imageMediaType(p),
        })),
      ],
    };

    const result = await agent.generate([message], {
      modelSettings: { maxOutputTokens: 200, temperature: 0.3 },
    });
    return result.text.trim();
  } catch (err) {
    console.error("[opinion] 图集观点提取失败:", err);
    return "";
  }
}

function buildTextPrompt(transcript: string, desc?: string): string {
  if (desc && desc.trim().length > 0) {
    return `文案描述：${desc.slice(0, 500)}\n\n口播转写：${transcript}`;
  }
  return transcript;
}

function buildImagePrompt(desc: string): string {
  if (desc && desc.trim().length > 0) {
    return `文案描述：${desc.slice(0, 500)}\n\n请根据以上文案和图片内容，提取博主的财经观点。`;
  }
  return "请根据图片内容，提取博主的财经观点。";
}

/** 文件扩展名 → IANA 媒体类型（图集图片仅 jpg/jpeg/png/webp，见 image-downloader） */
function imageMediaType(filePath: string): string {
  const ext = (filePath.split(".").pop() || "jpg").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}
