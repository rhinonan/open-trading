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

export type JudgmentResult =
  | "correct"
  | "mostly_correct"
  | "incorrect"
  | "not_applicable"
  | "not_yet";

export type SortDimension = "followers" | "recent" | "accuracy";

export type TranscriptStatus = "pending" | "processing" | "done" | "failed";

export interface DouyinBlogger {
  id: number;
  slug: string;
  douyinUid: string;
  nickname: string;
  avatarUrl: string;
  signature: string;
  followerCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface DouyinBloggerWithOpinion extends DouyinBlogger {
  latestOpinion: string;
  latestWorkAt: number | null;
  accuracy: number | null;
}

export interface DouyinWork {
  id: number;
  awemeId: string;
  bloggerId: number;
  desc: string;
  transcript: string | null;
  transcriptStatus: TranscriptStatus;
  duration: number;
  videoUrl: string | null;
  opinionSummary: string;
  coverUrl: string;
  shareUrl: string;
  statistics: string;
  publishedAt: number;
  scannedAt: number;
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

export interface PredictionItem {
  id: number;
  workId: number;
  predictedContent: string;
  predictionTarget: string;
  relatedSymbols: string;
  judgment: JudgmentResult;
  verifiableAfter: string | null;
  reasoning: string;
  evidence: string;
  judgedAt: number;
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
