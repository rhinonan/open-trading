"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { label: "基础设置", href: "/settings" },
  { label: "抖音雷达", href: "/settings/douyin" },
  { label: "调度", href: "/settings/schedule" },
  { label: "队列", href: "/settings/queues" },
  { label: "Skills", href: "/settings/skills" },
] as const;

function matchTab(pathname: string): string {
  // 更长路径优先，避免 /settings 抢占子路由
  const sorted = [...TABS].sort((a, b) => b.href.length - a.href.length);
  for (const tab of sorted) {
    if (tab.href === "/settings") {
      if (pathname === "/settings") return tab.href;
    } else if (pathname === tab.href || pathname.startsWith(tab.href + "/")) {
      return tab.href;
    }
  }
  return "/settings";
}

export function SettingsTabs() {
  const pathname = usePathname();
  const active = matchTab(pathname);

  return (
    <Tabs value={active}>
      <TabsList variant="line" className="w-full justify-start rounded-none border-b bg-transparent p-0">
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.href}
            value={tab.href}
            nativeButton={false}
            render={<Link href={tab.href} />}
            className="rounded-none"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
