import type { bloggers, works, predictionItems } from "@/db/schema";

// ==================== 股票相关 ====================

export interface Stock {
  symbol: string;
  name: string;
  exchange: string;
  industry: string;
  marketCap: number;
  price: number;
  change: number;
  changePercent: number;
}

export interface StockDetail extends Stock {
  open: number;
  high: number;
  low: number;
  volume: number;
  prevClose: number;
  pe: number;
  eps: number;
  dividend: number;
  description: string;
}

// ==================== Agent 相关 ====================

export type AgentStatus = "idle" | "running" | "completed" | "error";

export interface Agent {
  id: string;
  name: string;
  type: "stock-analysis" | "industry-analysis" | "sentiment" | "financials";
  status: AgentStatus;
  currentTask?: string;
  lastActive: string;
}

export interface AgentTask {
  id: string;
  agentId: string;
  type: string;
  target: string;
  status: AgentStatus;
  createdAt: string;
  completedAt?: string;
  result?: unknown;
}

// ==================== 舆情相关 ====================

export interface SentimentItem {
  id: string;
  source: "twitter" | "reddit" | "weibo" | "news";
  content: string;
  sentiment: "positive" | "negative" | "neutral";
  score: number;
  url: string;
  publishedAt: string;
  relatedSymbols: string[];
}

// ==================== 财报研报 ====================

export interface FinancialReport {
  id: string;
  symbol: string;
  period: string;
  revenue: number;
  netIncome: number;
  eps: number;
  filedAt: string;
}

export interface ResearchReport {
  id: string;
  title: string;
  author: string;
  institution: string;
  symbol: string;
  rating: "buy" | "hold" | "sell";
  targetPrice: number;
  summary: string;
  publishedAt: string;
  fileUrl?: string;
}

// ==================== 行业相关 ====================

export interface Industry {
  id: string;
  name: string;
  changePercent: number;
  volume: number;
  leadingStocks: string[];
}

// ==================== 通用 ====================

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export interface DashboardStats {
  totalStocks: number;
  avgChange: number;
  topGainer: Stock;
  topLoser: Stock;
  sentimentScore: number;
}

// ==================== 抖音博主监控 ====================

// 行类型一律从 drizzle schema 派生（$inferSelect），杜绝手写类型与 schema 漂移。
// 注意：上方必须是 import type —— schema 模块含运行时代码，值导入会进客户端 bundle。
export type DouyinBlogger = typeof bloggers.$inferSelect;
export type DouyinWork = typeof works.$inferSelect;
export type PredictionItem = typeof predictionItems.$inferSelect;

export type TranscriptStatus = DouyinWork["transcriptStatus"];
export type JudgmentResult = PredictionItem["judgment"];

export type SortDimension = "followers" | "recent" | "accuracy";

export interface DouyinBloggerWithOpinion extends DouyinBlogger {
  latestOpinion: string;
  latestWorkAt: number | null;
  accuracy: number | null;
}

export interface WorkJudgment {
  evalStatus: "none" | "pending" | "processing" | "done" | "failed";
  evaluable: number;
  correct: number;
  mostlyCorrect: number;
  incorrect: number;
  notYet: number;
  notApplicable: number;
  latestItem: { judgment: string; predictedContent: string } | null;
}

export interface MarketSnapshot {
  date: string;
  indices: {
    shanghai: { close: number; change: number; changePercent: number };
    shenzhen: { close: number; change: number; changePercent: number };
    chinext: { close: number; change: number; changePercent: number };
  };
  topSectors: Array<{ name: string; changePercent: number }>;
  bottomSectors: Array<{ name: string; changePercent: number }>;
}

// ==================== 抖音管理表格 ====================

export interface WorkWithBlogger {
  id: number;
  awemeId: string;
  desc: string;
  coverUrl: string;
  mediaType: number;
  duration: number;
  statistics: string;
  publishedAt: number;
  transcriptStatus: TranscriptStatus;
  transcript: string | null;
  opinionSummary: string;
  blogger: {
    id: number;
    slug: string;
    nickname: string;
    avatarUrl: string;
    followerCount: number;
  };
  judgment: WorkJudgment | null;
}

export interface WorksFilter {
  bloggerSlugs?: string[];
  transcriptStatus?: string;
  judgment?: string;
  search?: string;
  page: number;
  perPage: number;
}

export interface FilterCounts {
  transcriptStatus: Record<string, number>;
  judgment: Record<string, number>;
}

export interface WorksResponse {
  works: WorkWithBlogger[];
  total: number;
  page: number;
  perPage: number;
  filterCounts: FilterCounts;
}

export type BatchAction = "transcribe" | "summarize";
