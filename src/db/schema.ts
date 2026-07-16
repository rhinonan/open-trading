import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
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
});

export const works = sqliteTable("works", {
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
});

export const evaluations = sqliteTable("evaluations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bloggerId: integer("blogger_id")
    .notNull()
    .references(() => bloggers.id, { onDelete: "cascade" }),
  evalDate: text("eval_date").notNull(),
  worksCount: integer("works_count").notNull().default(0),
  predictionSummary: text("prediction_summary").notNull().default(""),
  accuracyScore: integer("accuracy_score").notNull().default(0),
  evalDetail: text("eval_detail").notNull().default("{}"),
  marketSnapshot: text("market_snapshot").notNull().default("{}"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const predictionItems = sqliteTable("prediction_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  evaluationId: integer("evaluation_id")
    .notNull()
    .references(() => evaluations.id, { onDelete: "cascade" }),
  workId: integer("work_id")
    .notNull()
    .references(() => works.id, { onDelete: "cascade" }),
  predictedContent: text("predicted_content").notNull(),
  predictionTarget: text("prediction_target").notNull().default(""),
  predictionDetail: text("prediction_detail").notNull().default("{}"),
  judgment: text("judgment", {
    enum: ["correct", "mostly_correct", "incorrect", "not_applicable"],
  })
    .notNull()
    .default("not_applicable"),
  relatedSymbols: text("related_symbols").notNull().default("[]"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});
