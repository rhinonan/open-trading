"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "基础设置", href: "/settings" },
  { label: "抖音雷达", href: "/settings/douyin" },
  { label: "调度", href: "/settings/schedule" },
  { label: "Skills", href: "/settings/skills" },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "px-4 py-2 text-sm -mb-px border-b-2 transition-colors",
            pathname === tab.href
              ? "border-primary text-foreground font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
