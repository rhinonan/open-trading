"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageCircle,
  Radio,
  Plus,
  RefreshCw,
  BarChart3,
  UserPlus,
  Loader2,
} from "lucide-react";
import type { DouyinBlogger } from "@/types";

const categoryLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  pending: { label: "定位中", variant: "secondary" },
  predictor: { label: "预测型", variant: "default" },
  non_predictor: { label: "非预测型", variant: "outline" },
};

export default function DouyinPage() {
  const [bloggers, setBloggers] = useState<DouyinBlogger[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [uidInput, setUidInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [message, setMessage] = useState("");

  const fetchBloggers = useCallback(async () => {
    const res = await fetch("/api/douyin/bloggers");
    if (res.ok) {
      setBloggers(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBloggers();
  }, [fetchBloggers]);

  const handleAdd = async () => {
    if (!uidInput.trim()) return;
    setAdding(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/bloggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ douyinUid: uidInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setUidInput("");
        setMessage(`已添加 ${data.nickname}，正在后台定位中...`);
        fetchBloggers();
      } else {
        setMessage(`错误: ${data.error}`);
      }
    } catch {
      setMessage("添加失败，请检查网络");
    }
    setAdding(false);
  };

  const handleScan = async () => {
    setScanning(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/scan", { method: "POST" });
      const data = await res.json();
      setMessage(
        `扫描完成：检查了 ${data.total} 个博主，发现 ${data.totalNewWorks} 条新作品`
      );
    } catch {
      setMessage("扫描失败");
    }
    setScanning(false);
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/evaluate", { method: "POST" });
      const data = await res.json();
      setMessage(
        `评判完成：${data.totalBloggers} 个博主，共 ${data.totalPredictions} 条预测`
      );
    } catch {
      setMessage("评判失败");
    }
    setEvaluating(false);
  };

  return (
    <div className="space-y-6">
      {/* Header with sub-nav */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">舆情分析</h1>
        <p className="text-muted-foreground mt-1">
          社交媒体情绪监测与热点话题追踪
        </p>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <Link
          href="/sentiment"
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          舆情概览
        </Link>
        <Link
          href="/sentiment/douyin"
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-accent text-accent-foreground"
        >
          <Radio className="h-4 w-4" />
          抖音监控
        </Link>
      </div>

      {/* Add blogger row */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={uidInput}
              onChange={(e) => setUidInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="输入抖音博主 sec_uid..."
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button onClick={handleAdd} disabled={adding || !uidInput.trim()}>
              {adding ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              添加博主
            </Button>
          </div>
          {message && (
            <p className="mt-3 text-sm text-muted-foreground">{message}</p>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={handleScan} disabled={scanning}>
          {scanning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          手动扫描
        </Button>
        <Button variant="outline" onClick={handleEvaluate} disabled={evaluating}>
          {evaluating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <BarChart3 className="h-4 w-4 mr-2" />
          )}
          收盘评判
        </Button>
      </div>

      {/* Blogger grid */}
      {loading ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : bloggers.length === 0 ? (
        <Card className="flex items-center justify-center min-h-[200px] border-dashed">
          <CardContent className="text-center py-12">
            <Radio className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-muted-foreground">
              暂无博主，请添加一个抖音博主
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {bloggers.map((blogger) => {
            const cat = categoryLabels[blogger.category] || categoryLabels.pending;
            return (
              <Link key={blogger.id} href={`/sentiment/douyin/${blogger.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      {blogger.avatarUrl ? (
                        <img
                          src={blogger.avatarUrl}
                          alt={blogger.nickname}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <Radio className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{blogger.nickname}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {blogger.signature || "暂无签名"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <Badge variant={cat.variant}>{cat.label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {blogger.followerCount.toLocaleString()} 粉丝
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
