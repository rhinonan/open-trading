"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { LogIn, LogOut } from "lucide-react";

const GITHUB_URL = "https://github.com/rhinonan/open-trading";

// lucide-react 已移除品牌图标，这里内联 GitHub mark SVG
function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

const BREADCRUMB_MAP: Record<string, string> = {
  "/": "首页",
  "/douyin": "抖音雷达",
  "/stocks": "个股分析",
  "/industry": "行业分析",
  "/sentiment": "舆情分析",
  "/financials": "财报 & 研报",
  "/agents": "Agent 管理",
  "/agents/logs": "Agent 日志",
  "/settings": "设置",
  "/settings/douyin": "抖音雷达",
  "/settings/skills": "Skills",
  "/login": "登录",
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
  const router = useRouter();
  const breadcrumbs = getBreadcrumbs(pathname);
  const { me, loading, logout } = useAuth();

  async function onLogout() {
    await logout();
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1;
          return (
            <span key={crumb.href} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/40">/</span>}
              {isLast ? (
                <span className="text-foreground font-medium">{crumb.label}</span>
              ) : (
                <Link
                  href={crumb.href}
                  className={cn("hover:text-foreground transition-colors")}
                >
                  {crumb.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      {/* Right side: auth + GitHub + theme */}
      <div className="flex items-center gap-2">
        {!loading && me.authRequired && (
          me.authenticated ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 text-muted-foreground"
              onClick={() => void onLogout()}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">退出</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5"
              render={<Link href={`/login?next=${encodeURIComponent(pathname || "/settings")}`} />}
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">登录</span>
            </Button>
          )
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          render={
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          <GithubIcon className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">GitHub 仓库</span>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
