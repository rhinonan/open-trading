// src/mastra/workflows/analyze-image-workflow.ts
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq } from "drizzle-orm";
import { downloadImages } from "@/services/douyin/image-downloader";
import { extractOpinionFromImages } from "@/services/douyin/opinion-service";
import { llmLog } from "@/lib/llm-log";

const workflowInputSchema = z.object({
  workId: z.number(),
  awemeId: z.string(),
  desc: z.string(),
  imageUrls: z.array(z.string()),
});

type WorkflowInput = z.infer<typeof workflowInputSchema>;

const WORKFLOW_ID = "analyze-image-work";

// Step 1: 下载图片到本地
const downloadStep = createStep({
  id: "download-images",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({ imagePaths: z.array(z.string()) }),
  retries: 2,
  execute: async ({ inputData, mastra }) => {
    const { workId, awemeId, imageUrls } = inputData;
    const logger = mastra.getLogger();
    logger.info("download-images start", {
      workflowId: WORKFLOW_ID,
      workId,
      awemeId,
      imageCount: imageUrls.length,
    });
    llmLog("info", {
      event: "workflow.step.start",
      workflowId: WORKFLOW_ID,
      stepId: "download-images",
      workId,
      awemeId,
      imageCount: imageUrls.length,
    });
    const imagePaths = await downloadImages(awemeId, imageUrls);
    logger.info("download-images done", {
      workflowId: WORKFLOW_ID,
      workId,
      awemeId,
      downloaded: imagePaths.length,
      requested: imageUrls.length,
    });
    return { imagePaths };
  },
});

// Step 2: Vision LLM 观点提取 + 回写 DB
const analyzeAndSaveStep = createStep({
  id: "analyze-and-save",
  inputSchema: z.object({ imagePaths: z.array(z.string()) }),
  outputSchema: z.object({ opinionSummary: z.string() }),
  retries: 2,
  execute: async ({ inputData, getInitData, mastra }) => {
    const { workId, awemeId, desc } = getInitData<WorkflowInput>();
    const logger = mastra.getLogger();
    logger.info("analyze-and-save start", {
      workflowId: WORKFLOW_ID,
      workId,
      awemeId,
      imageCount: inputData.imagePaths.length,
    });
    llmLog("info", {
      event: "workflow.step.start",
      workflowId: WORKFLOW_ID,
      stepId: "analyze-and-save",
      workId,
      awemeId,
    });
    const opinionSummary = await extractOpinionFromImages(
      desc,
      inputData.imagePaths,
    );

    await db
      .update(works)
      .set({
        transcript: null, // 图集无转写
        transcriptStatus: "done",
        opinionSummary,
      })
      .where(eq(works.id, workId));

    logger.info("analyze-and-save done", {
      workflowId: WORKFLOW_ID,
      workId,
      awemeId,
      opinionChars: opinionSummary.length,
    });
    llmLog("info", {
      event: "workflow.step.success",
      workflowId: WORKFLOW_ID,
      stepId: "analyze-and-save",
      workId,
      awemeId,
      status: "success",
    });

    return { opinionSummary };
  },
});

export const analyzeImageWorkflow = createWorkflow({
  id: "analyze-image-work",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({ opinionSummary: z.string() }),
})
  .then(downloadStep)
  .then(analyzeAndSaveStep)
  .commit();
