"use client";

import { useSidebar } from "@/hooks/use-sidebar";
import { useMobile } from "@/hooks/use-mobile";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export function LayoutShell({ children }: { children: React.ReactNode }) {
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
