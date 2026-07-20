// scripts/run-eval-once.ts
// 一次性：对指定 work 跑 evaluate-work workflow，打印结果与 agent tool 调用摘要。
// 用法：pnpm exec tsx scripts/run-eval-once.ts [workId]
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

import { mastra } from "@/mastra";
import { db } from "@/db";
import { works, predictionItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SpanType } from "@mastra/core/observability";

const workId = Number(process.argv[2] || "3");

async function main() {
  const work = await db
    .select()
    .from(works)
    .where(eq(works.id, workId))
    .get();
  if (!work) {
    console.error(`work ${workId} not found`);
    process.exit(1);
  }
  if (work.transcriptStatus !== "done" || !work.opinionSummary) {
    console.error(`work ${workId} not ready: transcript=${work.transcriptStatus}`);
    process.exit(1);
  }

  // 允许重跑：若已 done/failed 先拨回 none 再由 workflow 写 done
  if (work.evalStatus === "done" || work.evalStatus === "failed" || work.evalStatus === "processing") {
    await db
      .update(works)
      .set({ evalStatus: "none", evalClaimedAt: null })
      .where(eq(works.id, workId));
  }

  console.log(
    JSON.stringify(
      {
        event: "manual.eval.start",
        workId,
        awemeId: work.awemeId,
        opinionSummary: work.opinionSummary,
        publishedAt: work.publishedAt,
      },
      null,
      2,
    ),
  );

  const run = await mastra.getWorkflow("evaluateWorkWorkflow").createRun();
  const t0 = Date.now();
  const result = await run.start({
    inputData: {
      workId: work.id,
      awemeId: work.awemeId,
      desc: work.desc ?? "",
      transcript: work.transcript,
      opinionSummary: work.opinionSummary,
      publishedAt: work.publishedAt,
      bloggerId: work.bloggerId,
    },
  });
  const latencyMs = Date.now() - t0;

  console.log(
    JSON.stringify(
      {
        event: "manual.eval.result",
        status: result.status,
        runId: run.runId,
        latencyMs,
        result:
          result.status === "success"
            ? (result as { result?: unknown }).result
            : undefined,
        error:
          result.status === "failed"
            ? String((result as { error?: unknown }).error)
            : undefined,
      },
      null,
      2,
    ),
  );

  // 落库预测条
  const preds = await db
    .select()
    .from(predictionItems)
    .where(eq(predictionItems.workId, workId))
    .all();
  console.log(
    JSON.stringify(
      {
        event: "manual.eval.predictions",
        count: preds.length,
        items: preds.map((p) => ({
          judgment: p.judgment,
          target: p.predictionTarget,
          content: p.predictedContent?.slice(0, 120),
          evidence: p.evidence?.slice(0, 400),
        })),
      },
      null,
      2,
    ),
  );

  // 从 observability 抽 tool 相关 span
  try {
    const store = await mastra.getStorage();
    const obs = await store?.getStore("observability");
    if (!obs) {
      console.log(JSON.stringify({ event: "manual.eval.spans", note: "no observability store" }));
      return;
    }

    // 近 15 分钟 evaluator 相关 spans
    const since = new Date(Date.now() - 15 * 60_000);
    const listed = await obs.listTraces?.({
      // API 形状因版本而异；失败则跳过
    } as never).catch?.(() => null);

    // 退路：直接查 mastra_ai_spans（若 list API 不可用）
    const Database = (await import("better-sqlite3")).default;
    const { dataPath } = await import("@/lib/data-root");
    const mdb = new Database(dataPath("mastra.db"), { readonly: true });
    const spans = mdb
      .prepare(
        `
      SELECT spanType, name, entityType, entityName,
             substr(CAST(input AS TEXT), 1, 200) as inputPreview,
             substr(CAST(output AS TEXT), 1, 200) as outputPreview,
             startedAt
      FROM mastra_ai_spans
      WHERE startedAt >= ?
        AND (
          name LIKE '%tool%' OR spanType LIKE '%TOOL%' OR spanType LIKE '%tool%'
          OR name LIKE '%getStock%' OR name LIKE '%getIndex%' OR name LIKE '%getSector%'
          OR name LIKE '%get-stock%' OR name LIKE '%get-index%' OR name LIKE '%get-sector%'
          OR entityName LIKE '%evaluator%'
        )
      ORDER BY startedAt DESC
      LIMIT 40
    `,
      )
      .all(since.toISOString());

    console.log(
      JSON.stringify(
        {
          event: "manual.eval.tool_spans",
          count: spans.length,
          spans,
        },
        null,
        2,
      ),
    );

    // 也列最近 agent run 的子 span 类型分布
    const types = mdb
      .prepare(
        `
      SELECT spanType, count(*) as n
      FROM mastra_ai_spans
      WHERE startedAt >= ?
      GROUP BY spanType
      ORDER BY n DESC
    `,
      )
      .all(since.toISOString());
    console.log(JSON.stringify({ event: "manual.eval.span_types", types }, null, 2));
    mdb.close();
    void listed;
    void SpanType;
  } catch (err) {
    console.log(
      JSON.stringify({
        event: "manual.eval.spans_error",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
