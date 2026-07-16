"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Radio,
  RefreshCw,
  Mic,
  Loader2,
  Trash2,
  UserPlus,
  BarChart3,
} from "lucide-react";
import type { DouyinBlogger } from "@/types";

export default function DouyinSettingsPage() {
  const [bloggers, setBloggers] = useState<DouyinBlogger[]>([]);
  const [loading, setLoading] = useState(true);
  const [uidInput, setUidInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [message, setMessage] = useState("");

  const fetchBloggers = useCallback(async () => {
    const res = await fetch("/api/douyin/bloggers");
    if (res.ok) setBloggers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchBloggers(); }, [fetchBloggers]);

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
        setMessage(`已添加 ${data.nickname}`);
        fetchBloggers();
      } else {
        setMessage(`错误: ${data.error}`);
      }
    } catch {
      setMessage("添加失败，请检查网络");
    }
    setAdding(false);
  };

  const handleDelete = async (slug: string, nickname: string) => {
    if (!confirm(`确定要删除博主「${nickname}」吗？相关作品和评判记录将一并删除。`)) return;
    try {
      const res = await fetch(`/api/douyin/bloggers/${slug}`, { method: "DELETE" });
      if (res.ok) {
        setMessage(`已删除 ${nickname}`);
        fetchBloggers();
      } else {
        const data = await res.json();
        setMessage(`错误: ${data.error}`);
      }
    } catch {
      setMessage("删除失败");
    }
  };

  const handleScan = async () => {
    setScanning(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/scan", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`扫描完成：检查了 ${data.total} 个博主，发现 ${data.totalNewWorks} 条新作品`);
      } else {
        setMessage(`扫描失败: ${data.error}`);
      }
    } catch {
      setMessage("扫描失败");
    }
    setScanning(false);
  };

  const handleTranscribe = async () => {
    setTranscribing(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/transcribe", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`转写完成：共 ${data.total} 条，成功 ${data.done} 条${data.failed > 0 ? `，失败 ${data.failed} 条` : ""}`);
      } else {
        setMessage(`转写失败: ${data.error}`);
      }
    } catch {
      setMessage("转写请求失败");
    }
    setTranscribing(false);
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/evaluate", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`评判完成：${data.totalBloggers} 个博主，共 ${data.totalPredictions} 条预测`);
      } else {
        setMessage(`评判失败: ${data.error}`);
      }
    } catch {
      setMessage("评判请求失败，请检查网络");
    }
    setEvaluating(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Radio className="h-4 w-4" />
          抖音雷达管理
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 添加博主 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">添加博主</h3>
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
              {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
              添加
            </Button>
          </div>
        </div>

        {/* 已添加博主列表 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">已添加博主</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : bloggers.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无博主</p>
          ) : (
            <div className="space-y-2">
              {bloggers.map((blogger) => {
                return (
                  <div
                    key={blogger.id}
                    className="flex items-center gap-3 rounded-md border p-3"
                  >
                    {blogger.avatarUrl ? (
                      <img src={blogger.avatarUrl} alt={blogger.nickname}
                        className="h-8 w-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{blogger.nickname}</p>
                      <p className="text-xs text-muted-foreground">
                        {(blogger.followerCount ?? 0).toLocaleString()} 粉丝
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0"
                      onClick={() => handleDelete(blogger.slug, blogger.nickname)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 操作区 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">操作</h3>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleScan} disabled={scanning}>
              {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              扫描全部博主
            </Button>
            <Button variant="outline" onClick={handleTranscribe} disabled={transcribing}>
              {transcribing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mic className="h-4 w-4 mr-2" />}
              开始转写
            </Button>
            <Button variant="outline" onClick={handleEvaluate} disabled={evaluating}>
              {evaluating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />}
              收盘评判
            </Button>
          </div>
        </div>

        {/* 反馈消息 */}
        {message && (
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">{message}</p>
        )}
      </CardContent>
    </Card>
  );
}
