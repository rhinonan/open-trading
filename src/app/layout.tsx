import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { LayoutShell } from "@/components/layout/layout-shell";
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
