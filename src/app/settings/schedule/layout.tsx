"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SUB_TABS = [
  { label: "调度配置", href: "/settings/schedule" },
  { label: "运行历史", href: "/settings/schedule/history" },
] as const;

export default function ScheduleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active =
    pathname === "/settings/schedule/history"
      ? "/settings/schedule/history"
      : "/settings/schedule";

  return (
    <div className="space-y-6">
      <Tabs value={active}>
        <TabsList
          variant="line"
          className="w-full justify-start rounded-none border-b bg-transparent p-0"
        >
          {SUB_TABS.map((tab) => (
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
      {children}
    </div>
  );
}
