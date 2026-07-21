"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/use-mobile";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/hooks/use-auth";
import {
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from "./sidebar-width";

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
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  soon?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "监测",
    items: [{ label: "抖音雷达", href: "/douyin", icon: Radio }],
  },
  {
    label: "研究",
    items: [
      { label: "个股分析", href: "/stocks", icon: TrendingUp, soon: true },
      { label: "行业分析", href: "/industry", icon: Building2, soon: true },
      { label: "舆情分析", href: "/sentiment", icon: MessageCircle, soon: true },
      { label: "财报 & 研报", href: "/financials", icon: FileText, soon: true },
    ],
  },
  {
    label: "系统",
    items: [
      { label: "Agent 管理", href: "/agents", icon: Bot },
      { label: "Agent 日志", href: "/agents/logs", icon: ScrollText },
      { label: "设置", href: "/settings", icon: Settings },
    ],
  },
];

function NavLink({
  item,
  collapsed,
  isActive,
}: {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        item.soon && !isActive && "opacity-55",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
        />
      )}
      <item.icon className="h-5 w-5 shrink-0" />
      {!collapsed && (
        <>
          <span className="truncate flex-1">{item.label}</span>
          {item.soon && (
            <span className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
              Soon
            </span>
          )}
        </>
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isMobile = useMobile();
  const { collapsed, toggle } = useSidebar();
  const { me, loading } = useAuth();

  // 鉴权启用且未登录时隐藏「设置」；加载完成前不藏，避免本机无 token 时闪一下
  const hideSettings = !loading && me.authRequired && !me.authenticated;

  const navGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !(hideSettings && item.href === "/settings"),
    ),
  })).filter((group) => group.items.length > 0);

  const visibleItems = navGroups.flatMap((g) => g.items);

  // 最长前缀匹配：/agents/logs 不会同时高亮 /agents
  const matchingItem = visibleItems
    .filter(
      (it) => pathname === it.href || pathname.startsWith(it.href + "/"),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];

  const sidebarContent = (
    <div
      className={cn(
        "flex h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2 font-semibold text-base">
            <TrendingUp className="h-5 w-5 text-sidebar-primary" />
            <span className="font-display tracking-tight">Open Trading</span>
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
        <nav className="flex flex-col gap-4">
          <TooltipProvider delay={0}>
            {navGroups.map((group) => (
              <div key={group.label} className="flex flex-col gap-1">
                {!collapsed && (
                  <p className="px-3 mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                )}
                {group.items.map((item) => {
                  const isActive = item === matchingItem;

                  const link = (
                    <NavLink
                      item={item}
                      collapsed={collapsed}
                      isActive={isActive}
                    />
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger render={link} />
                        <TooltipContent side="right">
                          {item.label}
                          {item.soon ? "（即将推出）" : ""}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return <div key={item.href}>{link}</div>;
                })}
              </div>
            ))}
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
        <SheetContent side="left" className="p-0 w-56">
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
