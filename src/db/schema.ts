import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const bloggers = sqliteTable("bloggers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique().default(""),
  douyinUid: text("douyin_uid").notNull().unique(),
  nickname: text("nickname").notNull(),
  avatarUrl: text("avatar_url").notNull().default(""),
  signature: text("signature").notNull().default(""),
  followerCount: integer("follower_count").notNull().default(0),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
  disabled: integer("disabled").notNull().default(0),
});

export const works = sqliteTable(
  "works",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    awemeId: text("aweme_id").notNull().unique(),
    bloggerId: integer("blogger_id")
      .notNull()
      .references(() => bloggers.id, { onDelete: "cascade" }),
    desc: text("desc").notNull().default(""),
    videoUrl: text("video_url"),
    transcript: text("transcript"),
    transcriptStatus: text("transcript_status", {
      enum: ["pending", "processing", "done", "failed"],
    })
      .notNull()
      .default("pending"),
    duration: integer("duration").notNull().default(0),
    opinionSummary: text("opinion_summary").notNull().default(""),
    coverUrl: text("cover_url").notNull().default(""),
    shareUrl: text("share_url").notNull().default(""),
    statistics: text("statistics").notNull().default("{}"),
    publishedAt: integer("published_at").notNull(),
    scannedAt: integer("scanned_at")
      .notNull()
      .default(sql`(unixepoch())`),
    // 最近一次被 runner 认领的时刻（unixepoch 秒）；null = 从未认领
    claimedAt: integer("claimed_at"),
    // 评判状态（与 transcriptStatus 同构，复用队列模式）
    evalStatus: text("eval_status", {
      enum: ["none", "pending", "processing", "done", "failed"],
    }).notNull().default("none"),
    // 媒体类型：2=图集, 4=视频
    mediaType: integer("media_type").notNull().default(4),
    // 图集图片 URL 列表（JSON 数组字符串）
    imageUrls: text("image_urls").notNull().default("[]"),
    evalClaimedAt: integer("eval_claimed_at"),
    evaluatedAt: integer("evaluated_at"),
    lastError: text("last_error").default(""),
    /** 管线细进度 stage（queued / download_video / asr_poll …） */
    pipelineStage: text("pipeline_stage").notNull().default(""),
    /** 0–100 */
    pipelineProgress: integer("pipeline_progress").notNull().default(0),
    /** 中文展示文案，冗余便于前端直接显示 */
    pipelineStageLabel: text("pipeline_stage_label").notNull().default(""),
  },
  (t) => [
    index("works_blogger_id_idx").on(t.bloggerId),
    index("works_transcript_status_idx").on(t.transcriptStatus),
    index("works_eval_status_idx").on(t.evalStatus),
  ]
);

export const predictionItems = sqliteTable("prediction_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workId: integer("work_id")
    .notNull()
    .references(() => works.id, { onDelete: "cascade" }),
  predictedContent: text("predicted_content").notNull(),
  predictionTarget: text("prediction_target").notNull().default(""),
  relatedSymbols: text("related_symbols").notNull().default("[]"),
  judgment: text("judgment", {
    enum: ["correct", "mostly_correct", "incorrect", "not_yet", "not_applicable"],
  }).notNull(),
  verifiableAfter: text("verifiable_after"),
  reasoning: text("reasoning").notNull().default(""),
  evidence: text("evidence").notNull().default("{}"),
  judgedAt: integer("judged_at").notNull(),
}, (t) => [
  index("pred_items_work_id_idx").on(t.workId),
  index("pred_items_judgment_idx").on(t.judgment),
  index("pred_items_verifiable_idx").on(t.verifiableAfter).where(
    sql`judgment = 'not_yet'`
  ),
]);

export const jobRuns = sqliteTable(
  "job_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: text("job_id").notNull(),
    trigger: text("trigger").notNull().default("manual"),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
    status: text("status").notNull().default("running"),
    summary: text("summary").default(""),
    error: text("error").default(""),
  },
  (t) => [
    index("job_runs_job_id_idx").on(t.jobId),
    index("job_runs_started_at_idx").on(t.startedAt),
  ],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});
