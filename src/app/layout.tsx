import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { LayoutShell } from "@/components/layout/layout-shell";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// 品牌 wordmark 专用展示字体（可变字体，300-700）
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });

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
      <body className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} min-h-screen bg-background antialiased font-sans`}>
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
