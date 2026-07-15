"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const BREADCRUMB_MAP: Record<string, string> = {
  "/": "首页",
  "/douyin": "抖音雷达",
  "/stocks": "个股分析",
  "/industry": "行业分析",
  "/sentiment": "舆情分析",
  "/financials": "财报 & 研报",
  "/agents": "Agent 管理",
  "/settings": "设置",
};

function getBreadcrumbs(pathname: string): { label: string; href: string }[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [{ label: "首页", href: "/" }];

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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 after:absolute after:bottom-0 after:left-0 after:h-[1px] after:w-full after:bg-gradient-to-r after:from-transparent after:via-[var(--accent-tech)]/55 after:to-transparent">
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

      {/* Right side: theme toggle (all viewports) */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
