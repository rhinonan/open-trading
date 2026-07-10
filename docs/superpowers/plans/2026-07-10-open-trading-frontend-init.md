# Open Trading 前端框架初始化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 初始化 Next.js 前端项目，包含 Dark/Light 主题切换、侧边栏导航、shadcn/ui 组件库、Dashboard 首页及全部模块路由骨架。

**Architecture:** Next.js 14 App Router + Tailwind CSS class 策略暗色模式 + next-themes 主题管理 + shadcn/ui 组件。侧边栏布局，CSS 变量驱动主题色切换，lucide-react 图标。

**Tech Stack:** Next.js 14+, TypeScript strict, Tailwind CSS, next-themes, shadcn/ui (Radix UI), lucide-react

## Global Constraints

- TypeScript strict mode
- Tailwind `darkMode: "class"` 策略
- 所有图标使用 lucide-react
- shadcn/ui New York style + CSS variables
- 侧边栏布局，响应式适配移动端
- 各模块页面先做占位，后期对接真实数据

---

### Task 1: 项目脚手架 & 依赖安装

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts` 等（CLI 自动生成）

- [ ] **Step 1: 使用 create-next-app 初始化项目**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

Expected: 项目文件生成成功，无错误

- [ ] **Step 2: 安装额外依赖**

```bash
npm install next-themes lucide-react
```

Expected: 依赖安装成功

- [ ] **Step 3: 初始化 shadcn/ui**

```bash
npx shadcn@latest init -d --style new-york --base-color neutral --css-variables
```

Expected: `components.json` 生成，`src/lib/utils.ts` 被创建/更新

- [ ] **Step 4: 安装 shadcn/ui 组件**

```bash
npx shadcn@latest add button card dropdown-menu sheet separator tooltip avatar badge skeleton scroll-area -y
```

Expected: 组件安装到 `src/components/ui/`，无错误

- [ ] **Step 5: 验证项目可以启动**

```bash
npm run dev
```

访问 `http://localhost:3000`，应看到 Next.js 默认页面。确认后 `Ctrl+C` 停止。

- [ ] **Step 6: 提交**

```bash
git add -A && git commit -m "chore: scaffold Next.js project with shadcn/ui and deps"
```

---

### Task 2: Tailwind 暗色模式 & CSS 变量配置

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1: 配置 Tailwind darkMode**

Edit `tailwind.config.ts`，将 `darkMode` 设为 `"class"`：

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: "class",
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            colors: {
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                chart: {
                    "1": "hsl(var(--chart-1))",
                    "2": "hsl(var(--chart-2))",
                    "3": "hsl(var(--chart-3))",
                    "4": "hsl(var(--chart-4))",
                    "5": "hsl(var(--chart-5))",
                },
                sidebar: {
                    DEFAULT: "hsl(var(--sidebar-background))",
                    foreground: "hsl(var(--sidebar-foreground))",
                    primary: "hsl(var(--sidebar-primary))",
                    "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
                    accent: "hsl(var(--sidebar-accent))",
                    "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
                    border: "hsl(var(--sidebar-border))",
                    ring: "hsl(var(--sidebar-ring))",
                },
            },
        },
    },
    plugins: [],
};
export default config;
```

- [ ] **Step 2: 写入 globals.css CSS 变量**

Replace `src/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
    --sidebar-background: 0 0% 98%;
    --sidebar-foreground: 240 5.3% 26.1%;
    --sidebar-primary: 240 5.9% 10%;
    --sidebar-primary-foreground: 0 0% 98%;
    --sidebar-accent: 240 4.8% 95.9%;
    --sidebar-accent-foreground: 240 5.9% 10%;
    --sidebar-border: 220 13% 91%;
    --sidebar-ring: 217.2 91.2% 59.8%;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
    --sidebar-background: 240 5.9% 10%;
    --sidebar-foreground: 240 4.8% 95.9%;
    --sidebar-primary: 224.3 76.3% 48%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 240 3.7% 15.9%;
    --sidebar-accent-foreground: 240 4.8% 95.9%;
    --sidebar-border: 240 3.7% 15.9%;
    --sidebar-ring: 217.2 91.2% 59.8%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 3: 验证编译通过**

```bash
npm run build
```

Expected: BUILD SUCCESSFUL, no errors

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "feat: configure Tailwind dark mode and CSS variables"
```

---

### Task 3: 基础库文件（utils, types, api）

**Files:**
- Modify: `src/lib/utils.ts`（shadcn 已创建，确认内容）
- Create: `src/types/index.ts`
- Create: `src/lib/api.ts`

- [ ] **Step 1: 确认 utils.ts 内容**

Read `src/lib/utils.ts`，确认包含 `cn()` 函数。如不存在则写入：

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: 创建类型定义文件**

Create `src/types/index.ts`:

```typescript
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
```

- [ ] **Step 3: 创建 API 请求层**

Create `src/lib/api.ts`:

```typescript
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
```

- [ ] **Step 4: 验证编译通过**

```bash
npm run build
```

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: add base lib files (utils, types, api layer)"
```

---

### Task 4: 主题系统（ThemeProvider + ThemeToggle）

**Files:**
- Create: `src/components/layout/theme-provider.tsx`
- Create: `src/components/layout/theme-toggle.tsx`

- [ ] **Step 1: 创建 ThemeProvider 客户端组件**

Create `src/components/layout/theme-provider.tsx`:

```typescript
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

- [ ] **Step 2: 创建 ThemeToggle 组件**

Create `src/components/layout/theme-toggle.tsx`:

```typescript
"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">切换主题</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          亮色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          暗色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <span className="mr-2 h-4 w-4 flex items-center justify-center text-xs">
            💻
          </span>
          跟随系统
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: 验证编译**

```bash
npm run build
```

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "feat: add ThemeProvider and ThemeToggle components"
```

---

### Task 5: 布局组件（Sidebar + Header + useMobile）

**Files:**
- Create: `src/hooks/use-mobile.ts`
- Create: `src/components/layout/sidebar.tsx`
- Create: `src/components/layout/header.tsx`

- [ ] **Step 1: 创建 use-mobile hook**

Create `src/hooks/use-mobile.ts`:

```typescript
"use client";

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

export function useMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);

    setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
```

- [ ] **Step 1.5: 创建 SidebarContext（侧边栏折叠状态共享）**

Create `src/hooks/use-sidebar.ts`:

```typescript
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
  toggle: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = () => setCollapsed((prev) => !prev);
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
```

- [ ] **Step 2: 创建 Sidebar 组件**

Create `src/components/layout/sidebar.tsx`:

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/use-mobile";
import { useSidebar } from "@/hooks/use-sidebar";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  TrendingUp,
  Building2,
  MessageCircle,
  FileText,
  Bot,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "仪表盘", href: "/", icon: LayoutDashboard },
  { label: "个股分析", href: "/stocks", icon: TrendingUp },
  { label: "行业分析", href: "/industry", icon: Building2 },
  { label: "舆情分析", href: "/sentiment", icon: MessageCircle },
  { label: "财报 & 研报", href: "/financials", icon: FileText },
  { label: "Agent 管理", href: "/agents", icon: Bot },
  { label: "设置", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const isMobile = useMobile();
  const { collapsed, toggle } = useSidebar();

  const sidebarContent = (
    <div
      className={cn(
        "flex h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
            <TrendingUp className="h-5 w-5 text-sidebar-primary" />
            <span>Open Trading</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/" className="mx-auto">
            <TrendingUp className="h-5 w-5 text-sidebar-primary" />
          </Link>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          <TooltipProvider delayDuration={0}>
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              const link = (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70",
                    collapsed && "justify-center px-2"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }

              return link;
            })}
          </TooltipProvider>
        </nav>
      </ScrollArea>

      {/* Bottom actions */}
      <div className="border-t border-sidebar-border p-3 flex items-center gap-2">
        {!collapsed && <ThemeToggle />}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground",
            collapsed && "mx-auto"
          )}
          onClick={toggle}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );

  // Mobile: render Sheet
  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="fixed top-3 left-3 z-50 h-9 w-9">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64">
          {sidebarContent}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: fixed sidebar
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen">
      {sidebarContent}
    </aside>
  );
}
```

- [ ] **Step 3: 创建 Header 组件**

Create `src/components/layout/header.tsx`:

```typescript
"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const BREADCRUMB_MAP: Record<string, string> = {
  "/": "仪表盘",
  "/stocks": "个股分析",
  "/industry": "行业分析",
  "/sentiment": "舆情分析",
  "/financials": "财报 & 研报",
  "/agents": "Agent 管理",
  "/settings": "设置",
};

function getBreadcrumbs(pathname: string): { label: string; href: string }[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [{ label: "仪表盘", href: "/" }];

  let current = "";
  for (const seg of segments) {
    current += `/${seg}`;
    const label = BREADCRUMB_MAP[current] || seg.toUpperCase();
    crumbs.push({ label, href: current });
  }

  return crumbs;
}

export function Header() {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground/40">/</span>}
            <span
              className={cn(
                i === breadcrumbs.length - 1 && "text-foreground font-medium"
              )}
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      {/* Right side: theme toggle (mobile fallback) */}
      <div className="md:hidden">
        <ThemeToggle />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: 验证编译**

```bash
npm run build
```

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: add Sidebar, Header, and useMobile hook"
```

---

### Task 6: 根布局 RootLayout 接入

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: 更新 RootLayout**

Replace `src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open Trading — 智能股票分析系统",
  description:
    "基于多 Agent 架构的股票分析系统，涵盖个股分析、行业研究、舆情监测、财报研报",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SidebarProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <MainContent>{children}</MainContent>
            </div>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

function MainContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col transition-all duration-300 md:ml-64 group-data-[collapsed=true]:md:ml-16">
      <Header />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

Wait — `group-data` won't work cleanly here. Better approach: use the `useSidebar` hook in a client wrapper:

```typescript
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open Trading — 智能股票分析系统",
  description:
    "基于多 Agent 架构的股票分析系统，涵盖个股分析、行业研究、舆情监测、财报研报",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SidebarProvider>
            <LayoutShell>{children}</LayoutShell>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

function LayoutShell({ children }: { children: React.ReactNode }) {
  "use client";

  const { collapsed } = useSidebar();
  const isMobile = useMobile();

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col">
        <Sidebar />
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div
        className={`flex flex-1 flex-col transition-all duration-300 ${
          collapsed ? "md:ml-16" : "md:ml-64"
        }`}
      >
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

And to the top of `layout.tsx`, add the imports:
```typescript
import { useSidebar } from "@/hooks/use-sidebar";
import { useMobile } from "@/hooks/use-mobile";
```
```

- [ ] **Step 2: 验证编译 & 启动**

```bash
npm run build && npm run dev
```

访问 `http://localhost:3000`，应该看到空白内容页但有完整的侧边栏和 Header。测试主题切换。

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "feat: wire up RootLayout with ThemeProvider, Sidebar, and Header"
```

---

### Task 7: Dashboard 首页组件

**Files:**
- Create: `src/components/dashboard/market-banner.tsx`
- Create: `src/components/dashboard/hotspot-stocks.tsx`
- Create: `src/components/dashboard/industry-snapshot.tsx`
- Create: `src/components/dashboard/sentiment-preview.tsx`
- Create: `src/components/dashboard/recent-activity.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 创建 MarketBanner 组件**

Create `src/components/dashboard/market-banner.tsx`:

```typescript
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, BarChart3, DollarSign } from "lucide-react";

const STATS = [
  { label: "上证指数", value: "3,245.18", change: "+0.62%", up: true, icon: TrendingUp },
  { label: "深证成指", value: "10,872.36", change: "+1.15%", up: true, icon: TrendingUp },
  { label: "涨跌家数", value: "2,856 / 1,092", change: "", up: true, icon: BarChart3 },
  { label: "成交额", value: "8,562 亿", change: "+12.3%", up: true, icon: DollarSign },
];

export function MarketBanner() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STATS.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold">{stat.value}</span>
              {stat.change && (
                <span
                  className={`text-sm font-medium ${
                    stat.up ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {stat.up ? (
                    <TrendingUp className="inline h-3 w-3 mr-0.5" />
                  ) : (
                    <TrendingDown className="inline h-3 w-3 mr-0.5" />
                  )}
                  {stat.change}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 创建 HotspotStocks 组件**

Create `src/components/dashboard/hotspot-stocks.tsx`:

```typescript
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, TrendingUp } from "lucide-react";

const MOCK_STOCKS = [
  { symbol: "AAPL", name: "苹果", price: 198.52, change: 2.34 },
  { symbol: "NVDA", name: "英伟达", price: 128.44, change: 5.67 },
  { symbol: "TSLA", name: "特斯拉", price: 246.38, change: -1.23 },
  { symbol: "600519", name: "贵州茅台", price: 1682.50, change: 0.85 },
  { symbol: "000858", name: "五粮液", price: 156.20, change: -0.45 },
];

export function HotspotStocks() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">个股热点</CardTitle>
        <Link
          href="/stocks"
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          查看全部 →
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {MOCK_STOCKS.map((stock) => (
            <Link
              key={stock.symbol}
              href={`/stocks/${stock.symbol}`}
              className="flex items-center justify-between rounded-lg p-2 hover:bg-muted/50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium">{stock.symbol}</p>
                <p className="text-xs text-muted-foreground">{stock.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{stock.price.toFixed(2)}</p>
                <Badge
                  variant={stock.change >= 0 ? "default" : "destructive"}
                  className="text-xs h-5"
                >
                  {stock.change >= 0 ? (
                    <ArrowUp className="mr-0.5 h-3 w-3" />
                  ) : (
                    <ArrowDown className="mr-0.5 h-3 w-3" />
                  )}
                  {stock.change > 0 ? "+" : ""}
                  {stock.change}%
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: 创建 IndustrySnapshot 组件**

Create `src/components/dashboard/industry-snapshot.tsx`:

```typescript
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Building2 } from "lucide-react";

const MOCK_INDUSTRIES = [
  { name: "半导体", change: 3.42 },
  { name: "新能源汽车", change: 2.18 },
  { name: "人工智能", change: 1.95 },
  { name: "生物医药", change: -0.87 },
  { name: "食品饮料", change: -1.32 },
];

export function IndustrySnapshot() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">行业板块</CardTitle>
        <Link
          href="/industry"
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          查看全部 →
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {MOCK_INDUSTRIES.map((industry) => (
            <div
              key={industry.name}
              className="flex items-center justify-between rounded-lg p-2 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{industry.name}</span>
              </div>
              <Badge
                variant={industry.change >= 0 ? "default" : "destructive"}
                className="text-xs h-5"
              >
                {industry.change >= 0 ? (
                  <ArrowUp className="mr-0.5 h-3 w-3" />
                ) : (
                  <ArrowDown className="mr-0.5 h-3 w-3" />
                )}
                {industry.change > 0 ? "+" : ""}
                {industry.change}%
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: 创建 SentimentPreview 组件**

Create `src/components/dashboard/sentiment-preview.tsx`:

```typescript
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";

const MOCK_SENTIMENTS = [
  { keyword: "AI 芯片", score: 82, sentiment: "positive" as const },
  { keyword: "降息预期", score: 75, sentiment: "positive" as const },
  { keyword: "新能源补贴", score: 68, sentiment: "positive" as const },
  { keyword: "贸易摩擦", score: 35, sentiment: "negative" as const },
  { keyword: "地产政策", score: 48, sentiment: "neutral" as const },
];

const sentimentConfig = {
  positive: { icon: TrendingUp, className: "text-green-500 bg-green-500/10" },
  negative: { icon: TrendingDown, className: "text-red-500 bg-red-500/10" },
  neutral: { icon: Minus, className: "text-yellow-500 bg-yellow-500/10" },
};

export function SentimentPreview() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">舆情速览</CardTitle>
        <Link
          href="/sentiment"
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          查看全部 →
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {MOCK_SENTIMENTS.map((item) => {
            const config = sentimentConfig[item.sentiment];
            const Icon = config.icon;
            return (
              <div
                key={item.keyword}
                className="flex items-center justify-between rounded-lg p-2 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded-md p-1 ${config.className}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm font-medium">{item.keyword}</span>
                </div>
                <Badge variant="secondary" className="text-xs h-5">
                  热度 {item.score}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: 创建 RecentActivity 组件**

Create `src/components/dashboard/recent-activity.tsx`:

```typescript
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingUp, Building2, MessageCircle, FileText } from "lucide-react";

const MOCK_ACTIVITIES = [
  {
    id: "1",
    type: "stock",
    target: "NVDA — 英伟达",
    description: "多 Agent 综合分析完成",
    time: "2 小时前",
    href: "/stocks/NVDA",
  },
  {
    id: "2",
    type: "industry",
    target: "半导体行业",
    description: "行业对比分析报告已生成",
    time: "5 小时前",
    href: "/industry",
  },
  {
    id: "3",
    type: "sentiment",
    target: "AI 芯片舆情",
    description: "社交媒体情绪指数更新",
    time: "8 小时前",
    href: "/sentiment",
  },
  {
    id: "4",
    type: "financials",
    target: "AAPL — 苹果",
    description: "Q2 财报数据已导入",
    time: "昨天",
    href: "/financials",
  },
];

const typeConfig = {
  stock: { icon: TrendingUp, color: "text-blue-500 bg-blue-500/10" },
  industry: { icon: Building2, color: "text-purple-500 bg-purple-500/10" },
  sentiment: { icon: MessageCircle, color: "text-green-500 bg-green-500/10" },
  financials: { icon: FileText, color: "text-orange-500 bg-orange-500/10" },
};

export function RecentActivity() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">最近分析记录</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {MOCK_ACTIVITIES.map((activity) => {
            const config = typeConfig[activity.type as keyof typeof typeConfig];
            const Icon = config.icon;
            return (
              <Link
                key={activity.id}
                href={activity.href}
                className="flex items-center gap-3 rounded-lg p-3 hover:bg-muted/50 transition-colors"
              >
                <span className={`rounded-md p-1.5 ${config.color}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{activity.target}</p>
                  <p className="text-xs text-muted-foreground">{activity.description}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  {activity.time}
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: 创建 Dashboard 首页**

Replace `src/app/page.tsx`:

```typescript
import { MarketBanner } from "@/components/dashboard/market-banner";
import { HotspotStocks } from "@/components/dashboard/hotspot-stocks";
import { IndustrySnapshot } from "@/components/dashboard/industry-snapshot";
import { SentimentPreview } from "@/components/dashboard/sentiment-preview";
import { RecentActivity } from "@/components/dashboard/recent-activity";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
        <p className="text-muted-foreground mt-1">
          市场概览与各模块摘要，点击卡片进入对应分析页面
        </p>
      </div>

      <MarketBanner />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <HotspotStocks />
        <IndustrySnapshot />
        <SentimentPreview />
      </div>

      <RecentActivity />
    </div>
  );
}
```

- [ ] **Step 7: 验证编译 & 启动**

```bash
npm run build && npm run dev
```

访问 `http://localhost:3000`，应该看到完整的 Dashboard，包含大盘 Banner、个股热点、行业板块、舆情速览、最近分析记录。

- [ ] **Step 8: 提交**

```bash
git add -A && git commit -m "feat: add Dashboard page with market banner and module cards"
```

---

### Task 8: 路由占位页 & 错误/Loading 页面

**Files:**
- Create: `src/app/stocks/page.tsx`
- Create: `src/app/stocks/[symbol]/page.tsx`
- Create: `src/app/industry/page.tsx`
- Create: `src/app/sentiment/page.tsx`
- Create: `src/app/financials/page.tsx`
- Create: `src/app/agents/page.tsx`
- Create: `src/app/settings/page.tsx`
- Create: `src/app/loading.tsx`
- Create: `src/app/error.tsx`

- [ ] **Step 1: 创建全局 loading 页**

Create `src/app/loading.tsx`:

```typescript
import { Skeleton } from "@/components/ui/skeleton";

export default function GlobalLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-[280px] rounded-xl" />
        <Skeleton className="h-[280px] rounded-xl" />
        <Skeleton className="h-[280px] rounded-xl" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建全局 error 页**

Create `src/app/error.tsx`:

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="mt-4 text-lg font-semibold">页面加载出错</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error.message || "发生了未知错误，请重试"}
          </p>
          <Button onClick={reset} className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" />
            重新加载
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: 创建占位页面组件（复用模式）**

Create a reusable placeholder in each page file:

**`src/app/stocks/page.tsx`**:
```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

export default function StocksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">个股分析</h1>
        <p className="text-muted-foreground mt-1">
          多 Agent 协作分析个股基本面、技术面与市场情绪
        </p>
      </div>
      <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">个股分析功能即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示股票搜索、筛选与多 Agent 分析面板
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

**`src/app/stocks/[symbol]/page.tsx`**:
```typescript
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, TrendingUp } from "lucide-react";
import Link from "next/link";

interface StockDetailPageProps {
  params: Promise<{ symbol: string }>;
}

export default async function StockDetailPage({ params }: StockDetailPageProps) {
  const { symbol } = await params;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/stocks"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{symbol.toUpperCase()}</h1>
        <Badge variant="secondary">分析中</Badge>
      </div>

      <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">多 Agent 分析面板即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示 K 线图表与各 Agent 的独立分析结论
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

**`src/app/industry/page.tsx`**:
```typescript
import { Card, CardContent } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export default function IndustryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">行业分析</h1>
        <p className="text-muted-foreground mt-1">
          行业对比、板块热度与资金流向分析
        </p>
      </div>
      <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">行业分析功能即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示行业对比表格与板块热度图
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

**`src/app/sentiment/page.tsx`**:
```typescript
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";

export default function SentimentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">舆情分析</h1>
        <p className="text-muted-foreground mt-1">
          社交媒体情绪监测与热点话题追踪
        </p>
      </div>
      <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <MessageCircle className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">舆情分析功能即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示舆情时间线、情绪仪表盘与来源分布
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

**`src/app/financials/page.tsx`**:
```typescript
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function FinancialsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">财报 & 研报</h1>
        <p className="text-muted-foreground mt-1">
          历史财报数据查询与机构研报汇总
        </p>
      </div>
      <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">财报 & 研报功能即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示财报数据表格与研报列表
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

**`src/app/agents/page.tsx`**:
```typescript
import { Card, CardContent } from "@/components/ui/card";
import { Bot } from "lucide-react";

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent 管理</h1>
        <p className="text-muted-foreground mt-1">
          多 Agent 状态监控、任务队列与日志查看
        </p>
      </div>
      <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <Bot className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">Agent 管理功能即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示 Agent 状态卡片、任务队列与实时日志
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

**`src/app/settings/page.tsx`**:
```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Settings, Sun, Moon, Monitor } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">设置</h1>
        <p className="text-muted-foreground mt-1">
          管理主题偏好、通知与数据源配置
        </p>
      </div>

      {/* Theme setting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">主题偏好</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 rounded-md border p-1">
                <Sun className="h-4 w-4 text-muted-foreground" />
                <Moon className="h-4 w-4 text-muted-foreground" />
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">切换主题</p>
                <p className="text-xs text-muted-foreground">
                  选择亮色、暗色或跟随系统
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

      {/* Placeholder */}
      <Card className="flex items-center justify-center min-h-[200px] border-dashed">
        <CardContent className="text-center py-12">
          <Settings className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">更多设置即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            通知管理、API Key 配置、数据源设置等功能将在后续版本添加
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: 验证编译 & 启动**

```bash
npm run build && npm run dev
```

逐一访问每个路由，确认侧边栏导航高亮正确，占位内容正常渲染。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: add route placeholder pages, loading skeleton, and error boundary"
```

---

### Task 9: 最终验证 & Meta 配置

**Files:**
- Modify: `src/app/layout.tsx`（确认 metadata 正确）

- [ ] **Step 1: 全量验证**

```bash
npm run build
```

确认 BUILD SUCCESSFUL，无 TypeScript 错误，无 ESLint 警告。

- [ ] **Step 2: 运行时验证清单**

启动 `npm run dev`，逐项验证：

| 验证项 | 操作 | 预期结果 |
|--------|------|---------|
| 亮色模式 | 首次加载或手动切换到 Light | 白色背景，侧边栏浅灰 |
| 暗色模式 | 切换到 Dark | 深色背景，所有组件切换 |
| 跟随系统 | 切换到 System | 匹配 OS 主题设置 |
| 防闪烁 | 在 Dark 模式下刷新页面 | 无亮色闪烁 |
| 侧边栏导航 | 点击各导航项 | 正确跳转，高亮当前路由 |
| 侧边栏折叠 | 点击折叠按钮 | 切换为仅图标模式 |
| 面包屑 | 进入深层页面 | 面包屑正确显示路径 |
| Dashboard | 访问 `/` | 大盘 Banner + 3 卡片 + 最近记录 |
| 占位页 | 访问 `/stocks` 等 | 各模块占位页显示 |
| 个股详情 | 访问 `/stocks/AAPL` | 动态路由页面，显示 symbol |
| Loading | 慢速网络下 | 骨架屏显示 |
| Error | 模拟错误 | Error 边界页显示 |
| 移动端 | 缩小浏览器 <768px | 侧边栏变 Sheet 抽屉 |

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "chore: final verification and polish"
```
