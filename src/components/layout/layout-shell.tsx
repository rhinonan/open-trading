"use client";

import { useSidebar } from "@/hooks/use-sidebar";
import { useMobile } from "@/hooks/use-mobile";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import {
  SIDEBAR_MARGIN_COLLAPSED,
  SIDEBAR_MARGIN_EXPANDED,
} from "@/components/layout/sidebar-width";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const isMobile = useMobile();

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col">
        <Sidebar />
        <Header />
        <main className="flex-1 px-4 py-4 md:px-6 md:py-5">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div
        className={`flex flex-1 flex-col transition-all duration-300 ${
          collapsed ? SIDEBAR_MARGIN_COLLAPSED : SIDEBAR_MARGIN_EXPANDED
        }`}
      >
        <Header />
        <main className="flex-1 px-4 py-4 md:px-6 md:py-5">{children}</main>
      </div>
    </div>
  );
}
