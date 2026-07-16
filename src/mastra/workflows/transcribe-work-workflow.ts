// src/mastra/workflows/transcribe-work-workflow.ts
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq } from "drizzle-orm";
import { downloadVideo } from "@/services/douyin/video-downloader";
import { extractAudio } from "@/services/douyin/audio-extractor";
import { transcribeAudio } from "@/services/douyin/transcriber";
import { extractOpinion } from "@/services/douyin/opinion-service";

// 单作品转写工作流输入
const workflowInputSchema = z.object({
  workId: z.number(),
  awemeId: z.string(),
  videoUrl: z.string(),
  duration: z.number(),
});

type WorkflowInput = z.infer<typeof workflowInputSchema>;

// 1. 下载视频
const downloadStep = createStep({
  id: "download-video",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({ videoPath: z.string() }),
  retries: 2,
  execute: async ({ inputData }) => {
    const { awemeId, videoUrl } = inputData;
    console.log(`[${awemeId}] 开始下载视频...`);
    const videoPath = await downloadVideo(awemeId, videoUrl);
    console.log(`[${awemeId}] 视频下载完成 → ${videoPath}`);
    return { videoPath };
  },
});

// 2. 提取音频
const extractAudioStep = createStep({
  id: "extract-audio",
  inputSchema: z.object({ videoPath: z.string() }),
  outputSchema: z.object({ audioPath: z.string() }),
  retries: 2,
  execute: async ({ inputData, getInitData }) => {
    const { awemeId } = getInitData<WorkflowInput>();
    console.log(`[${awemeId}] 开始提取音频...`);
    const audioPath = await extractAudio(inputData.videoPath, awemeId);
    console.log(`[${awemeId}] 音频提取完成 → ${audioPath}`);
    return { audioPath };
  },
});

// 3. ASR 转写
const transcribeStep = createStep({
  id: "transcribe-audio",
  inputSchema: z.object({ audioPath: z.string() }),
  outputSchema: z.object({ transcript: z.string() }),
  retries: 2,
  execute: async ({ inputData, getInitData }) => {
    const { awemeId, duration } = getInitData<WorkflowInput>();
    // duration=0 表示未知 — 按长音频（LFASR）兜底
    const effectiveDuration = duration > 0 ? duration : 61_000;
    const method = effectiveDuration / 1000 <= 60 ? "IAT (短音频)" : "LFASR (长音频)";
    console.log(`[${awemeId}] 开始语音转写 (${method}, duration=${effectiveDuration}ms)...`);
    const transcript = await transcribeAudio(inputData.audioPath, effectiveDuration);
    console.log(`[${awemeId}] 语音转写完成 → ${transcript.length} 字符`);
    return { transcript };
  },
});

// 4. 观点提取 + 回写业务库
const opinionAndSaveStep = createStep({
  id: "opinion-and-save",
  inputSchema: z.object({ transcript: z.string() }),
  outputSchema: z.object({
    transcript: z.string(),
    opinionSummary: z.string(),
  }),
  retries: 2,
  execute: async ({ inputData, getInitData }) => {
    const { workId, awemeId } = getInitData<WorkflowInput>();
    console.log(`[${awemeId}] 开始提取观点摘要...`);
    // extractOpinion 内部已捕获所有异常并返回 ""（非致命）
    const opinionSummary = await extractOpinion(inputData.transcript);
    console.log(`[${awemeId}] 观点摘要 → ${opinionSummary.slice(0, 50)}...`);

    db.update(works)
      .set({
        transcript: inputData.transcript,
        transcriptStatus: "done",
        opinionSummary,
      })
      .where(eq(works.id, workId))
      .run();

    return { transcript: inputData.transcript, opinionSummary };
  },
});

export const transcribeWorkWorkflow = createWorkflow({
  id: "transcribe-work",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    transcript: z.string(),
    opinionSummary: z.string(),
  }),
})
  .then(downloadStep)
  .then(extractAudioStep)
  .then(transcribeStep)
  .then(opinionAndSaveStep)
  .commit();
