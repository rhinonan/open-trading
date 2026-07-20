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
import { llmLog } from "@/lib/llm-log";

// 单作品转写工作流输入
const workflowInputSchema = z.object({
  workId: z.number(),
  awemeId: z.string(),
  videoUrl: z.string(),
  duration: z.number(),
  desc: z.string(),
});

type WorkflowInput = z.infer<typeof workflowInputSchema>;

const WORKFLOW_ID = "transcribe-work";

// 1. 下载视频
const downloadStep = createStep({
  id: "download-video",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({ videoPath: z.string() }),
  retries: 2,
  execute: async ({ inputData, mastra }) => {
    const { workId, awemeId, videoUrl } = inputData;
    const logger = mastra.getLogger();
    logger.info("download-video start", { workflowId: WORKFLOW_ID, workId, awemeId });
    llmLog("info", {
      event: "workflow.step.start",
      workflowId: WORKFLOW_ID,
      stepId: "download-video",
      workId,
      awemeId,
    });
    const videoPath = await downloadVideo(awemeId, videoUrl);
    logger.info("download-video done", {
      workflowId: WORKFLOW_ID,
      workId,
      awemeId,
      videoPath,
    });
    return { videoPath };
  },
});

// 2. 提取音频
const extractAudioStep = createStep({
  id: "extract-audio",
  inputSchema: z.object({ videoPath: z.string() }),
  outputSchema: z.object({ audioPath: z.string() }),
  retries: 2,
  execute: async ({ inputData, getInitData, mastra }) => {
    const { workId, awemeId } = getInitData<WorkflowInput>();
    const logger = mastra.getLogger();
    logger.info("extract-audio start", { workflowId: WORKFLOW_ID, workId, awemeId });
    llmLog("info", {
      event: "workflow.step.start",
      workflowId: WORKFLOW_ID,
      stepId: "extract-audio",
      workId,
      awemeId,
    });
    const audioPath = await extractAudio(inputData.videoPath, awemeId);
    logger.info("extract-audio done", {
      workflowId: WORKFLOW_ID,
      workId,
      awemeId,
      audioPath,
    });
    return { audioPath };
  },
});

// 3. ASR 转写
const transcribeStep = createStep({
  id: "transcribe-audio",
  inputSchema: z.object({ audioPath: z.string() }),
  outputSchema: z.object({ transcript: z.string() }),
  retries: 2,
  execute: async ({ inputData, getInitData, mastra }) => {
    const { workId, awemeId, duration } = getInitData<WorkflowInput>();
    // duration=0 表示未知 — 按长音频（LFASR）兜底
    const effectiveDuration = duration > 0 ? duration : 61_000;
    const method = effectiveDuration / 1000 <= 60 ? "IAT" : "LFASR";
    const logger = mastra.getLogger();
    logger.info("transcribe-audio start", {
      workflowId: WORKFLOW_ID,
      workId,
      awemeId,
      method,
      durationMs: effectiveDuration,
    });
    llmLog("info", {
      event: "workflow.step.start",
      workflowId: WORKFLOW_ID,
      stepId: "transcribe-audio",
      workId,
      awemeId,
      method,
      durationMs: effectiveDuration,
    });
    const transcript = await transcribeAudio(inputData.audioPath, effectiveDuration);
    logger.info("transcribe-audio done", {
      workflowId: WORKFLOW_ID,
      workId,
      awemeId,
      transcriptChars: transcript.length,
    });
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
  execute: async ({ inputData, getInitData, mastra }) => {
    const { workId, awemeId, desc } = getInitData<WorkflowInput>();
    const logger = mastra.getLogger();
    logger.info("opinion-and-save start", { workflowId: WORKFLOW_ID, workId, awemeId });
    llmLog("info", {
      event: "workflow.step.start",
      workflowId: WORKFLOW_ID,
      stepId: "opinion-and-save",
      workId,
      awemeId,
    });
    // extractOpinion 内部已捕获所有异常并返回 ""（非致命）
    const opinionSummary = await extractOpinion(inputData.transcript, desc);

    await db
      .update(works)
      .set({
        transcript: inputData.transcript,
        transcriptStatus: "done",
        opinionSummary,
      })
      .where(eq(works.id, workId));

    logger.info("opinion-and-save done", {
      workflowId: WORKFLOW_ID,
      workId,
      awemeId,
      opinionChars: opinionSummary.length,
    });
    llmLog("info", {
      event: "workflow.step.success",
      workflowId: WORKFLOW_ID,
      stepId: "opinion-and-save",
      workId,
      awemeId,
      status: "success",
    });

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
