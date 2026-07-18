"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/use-mobile";
import { useSidebar } from "@/hooks/use-sidebar";

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
  TrendingUp,
  Building2,
  MessageCircle,
  FileText,
  Bot,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  Radio,
  ScrollText,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "抖音雷达", href: "/douyin", icon: Radio },
  { label: "个股分析", href: "/stocks", icon: TrendingUp },
  { label: "行业分析", href: "/industry", icon: Building2 },
  { label: "舆情分析", href: "/sentiment", icon: MessageCircle },
  { label: "财报 & 研报", href: "/financials", icon: FileText },
  { label: "Agent 管理", href: "/agents", icon: Bot },
  { label: "Agent 日志", href: "/agents/logs", icon: ScrollText },
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
            <span className="font-display uppercase tracking-wide">Open Trading</span>
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
          <TooltipProvider delay={0}>
            {NAV_ITEMS.map((item) => {
              // 最长前缀匹配：/agents/logs 不会同时高亮 /agents
              const matchingItem = NAV_ITEMS.filter(
                (it) =>
                  pathname === it.href ||
                  pathname.startsWith(it.href + "/")
              ).sort((a, b) => b.href.length - a.href.length)[0];
              const isActive = item === matchingItem;

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
                    <TooltipTrigger render={link} />
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
      <div
        className={cn(
          "border-t border-sidebar-border p-3 flex items-center",
          collapsed ? "justify-center" : "justify-end"
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground"
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
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="fixed top-3 left-3 z-50 h-9 w-9"
            />
          }
        >
          <Menu className="h-5 w-5" />
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
