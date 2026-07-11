const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
}

async function fetchAPI<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...init } = options;

  const url = new URL(`${API_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ==================== Stock API ====================

export const stockAPI = {
  list: (params?: Record<string, string | number | undefined>) =>
    fetchAPI<import("@/types").Stock[]>("/stocks", { params }),

  detail: (symbol: string) =>
    fetchAPI<import("@/types").StockDetail>(`/stocks/${symbol}`),
};

// ==================== Agent API ====================

export const agentAPI = {
  list: () => fetchAPI<import("@/types").Agent[]>("/agents"),

  tasks: (agentId?: string) =>
    fetchAPI<import("@/types").AgentTask[]>("/agents/tasks", {
      params: agentId ? { agentId } : undefined,
    }),
};

// ==================== Sentiment API ====================

export const sentimentAPI = {
  list: (symbol?: string) =>
    fetchAPI<import("@/types").SentimentItem[]>("/sentiment", {
      params: symbol ? { symbol } : undefined,
    }),
};

// ==================== Douyin Monitor API ====================

export const douyinAPI = {
  bloggers: {
    list: (category?: string) =>
      fetchAPI<import("@/types").DouyinBlogger[]>("/douyin/bloggers", {
        params: category ? { category } : undefined,
      }),

    get: (id: number) =>
      fetchAPI<import("@/types").DouyinBlogger>(`/douyin/bloggers/${id}`),

    create: (douyinUid: string) =>
      fetchAPI<import("@/types").DouyinBlogger>("/douyin/bloggers", {
        method: "POST",
        body: JSON.stringify({ douyinUid }),
      }),

    delete: (id: number) =>
      fetchAPI<{ success: boolean }>(`/douyin/bloggers/${id}`, {
        method: "DELETE",
      }),
  },

  scan: () =>
    fetchAPI<{
      total: number;
      totalNewWorks: number;
      results: unknown[];
    }>("/douyin/scan", { method: "POST" }),

  evaluate: (evalDate?: string) =>
    fetchAPI<{
      date: string;
      totalBloggers: number;
      totalPredictions: number;
      results: unknown[];
    }>("/douyin/evaluate", {
      method: "POST",
      body: evalDate ? JSON.stringify({ evalDate }) : undefined,
    }),

  records: (params?: {
    bloggerId?: number;
    evalDate?: string;
    type?: string;
  }) =>
    fetchAPI<
      Array<import("@/types").DouyinEvaluation & {
        items: import("@/types").PredictionItem[];
      }>
    >("/douyin/records", { params }),
};

// ==================== Financials API ====================

export const financialsAPI = {
  reports: (symbol: string) =>
    fetchAPI<import("@/types").FinancialReport[]>(`/stocks/${symbol}/financials`),

  research: (symbol?: string) =>
    fetchAPI<import("@/types").ResearchReport[]>("/research", {
      params: symbol ? { symbol } : undefined,
    }),
};

// ==================== Industry API ====================

export const industryAPI = {
  list: () => fetchAPI<import("@/types").Industry[]>("/industries"),
};

export { fetchAPI };
