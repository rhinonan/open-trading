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

export type BloggerCategory = "pending" | "predictor" | "non_predictor";
export type TranscriptStatus = "pending" | "processing" | "done" | "failed";
export type PredictionType =
  | "market_direction"
  | "index_level"
  | "sector"
  | "stock_pick";

export interface DouyinBlogger {
  id: number;
  douyinUid: string;
  nickname: string;
  avatarUrl: string;
  signature: string;
  followerCount: number;
  category: BloggerCategory;
  classifiedAt: number | null;
  classificationNote: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DouyinWork {
  id: number;
  awemeId: string;
  bloggerId: number;
  desc: string;
  transcript: string | null;
  transcriptStatus: TranscriptStatus;
  duration: number;
  coverUrl: string;
  shareUrl: string;
  statistics: string;
  publishedAt: number;
  scannedAt: number;
}

export interface DouyinEvaluation {
  id: number;
  bloggerId: number;
  evalDate: string;
  worksCount: number;
  predictionSummary: string;
  accuracyScore: number;
  evalDetail: string;
  marketSnapshot: string;
  createdAt: number;
}

export interface PredictionItem {
  id: number;
  evaluationId: number;
  workId: number;
  predictedContent: string;
  predictionType: PredictionType;
  predictionTarget: string;
  predictionDetail: string;
  isCorrect: number | null;
  judgment: string;
  relatedSymbols: string;
}

export interface PredictionMix {
  marketDirection: number;
  indexLevel: number;
  sector: number;
  stockPick: number;
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
