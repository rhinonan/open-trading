// src/mastra/workflows/analyze-image-workflow.ts
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq } from "drizzle-orm";
import { downloadImages } from "@/services/douyin/image-downloader";
import { extractOpinionFromImages } from "@/services/douyin/opinion-service";

const workflowInputSchema = z.object({
  workId: z.number(),
  awemeId: z.string(),
  desc: z.string(),
  imageUrls: z.array(z.string()),
});

type WorkflowInput = z.infer<typeof workflowInputSchema>;

// Step 1: 下载图片到本地
const downloadStep = createStep({
  id: "download-images",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({ imagePaths: z.array(z.string()) }),
  retries: 2,
  execute: async ({ inputData }) => {
    const { awemeId, imageUrls } = inputData;
    console.log(`[${awemeId}] 开始下载图集 (${imageUrls.length} 张)...`);
    const imagePaths = await downloadImages(awemeId, imageUrls);
    console.log(`[${awemeId}] 图片下载完成 → ${imagePaths.length}/${imageUrls.length} 张`);
    return { imagePaths };
  },
});

// Step 2: Vision LLM 观点提取 + 回写 DB
const analyzeAndSaveStep = createStep({
  id: "analyze-and-save",
  inputSchema: z.object({ imagePaths: z.array(z.string()) }),
  outputSchema: z.object({ opinionSummary: z.string() }),
  retries: 2,
  execute: async ({ inputData, getInitData }) => {
    const { workId, awemeId, desc } = getInitData<WorkflowInput>();
    console.log(`[${awemeId}] 开始图集观点分析...`);
    const opinionSummary = await extractOpinionFromImages(desc, inputData.imagePaths);
    console.log(`[${awemeId}] 图集观点 → ${opinionSummary.slice(0, 50)}...`);

    await db.update(works)
      .set({
        transcript: null, // 图集无转写
        transcriptStatus: "done",
        opinionSummary,
      })
      .where(eq(works.id, workId))
      .run();

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
