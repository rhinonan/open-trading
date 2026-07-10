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
