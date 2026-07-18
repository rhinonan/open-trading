"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

interface SkillMeta {
  name: string;
  description: string;
  version: string;
  sourceUrl: string;
  installedAt: string;
  enabled: boolean;
}

interface ReviewIssue {
  dimension: "security" | "execution_scope" | "license";
  severity: "error" | "warning";
  file: string | null;
  description: string;
}

interface SkillReviewResult {
  status: "pending" | "reviewing" | "passed" | "rejected";
  reviewedAt: string | null;
  verdict: "pass" | "reject";
  summary: string;
  issues: ReviewIssue[];
}

interface StagingItem extends SkillMeta {
  review: SkillReviewResult;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [url, setUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");
  const [mounts, setMounts] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [stagingItems, setStagingItems] = useState<StagingItem[]>([]);
  const [reviewingName, setReviewingName] = useState<string | null>(null);
  const [publishingName, setPublishingName] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    const res = await fetch("/api/skills");
    const data = await res.json();
    if (data.success) setSkills(data.skills);
  }, []);

  const fetchMounts = useCallback(async () => {
    const res = await fetch("/api/skills/mounts");
    const data = await res.json();
    if (data.success) setMounts(data.mounts);
  }, []);

  const fetchStaging = useCallback(async () => {
    const res = await fetch("/api/skills/staging");
    const data = await res.json();
    if (data.success) setStagingItems(data.staging);
  }, []);

  useEffect(() => {
    Promise.all([fetchSkills(), fetchMounts(), fetchStaging()]).finally(() =>
      setLoading(false)
    );
  }, [fetchSkills, fetchMounts, fetchStaging]);

  async function handleInstall() {
    if (!url.trim()) return;
    setInstalling(true);
    setError("");
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error);
        return;
      }
      setUrl("");
      await fetchStaging();
    } catch {
      setError("网络错误");
    } finally {
      setInstalling(false);
    }
  }

  async function handleToggle(name: string, enabled: boolean) {
    await fetch(`/api/skills/${name}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: enabled ? "disable" : "enable" }),
    });
    await fetchSkills();
  }

  async function handleDelete(name: string) {
    await fetch(`/api/skills/${name}`, { method: "DELETE" });
    setDeleteTarget(null);
    await fetchSkills();
  }

  async function handleCheckUpdate(name: string) {
    const res = await fetch(`/api/skills/${name}/check-update`, {
      method: "POST",
    });
    const data = await res.json();
    if (data.success) {
      alert(
        data.hasUpdate
          ? `新版本 ${data.latestVersion} 可用！\n${data.diff ?? ""}`
          : "已是最新"
      );
    }
  }

  async function handlePublish(name: string) {
    setPublishingName(name);
    try {
      const res = await fetch(`/api/skills/staging/${name}/publish`, { method: "POST" });
      const data = await res.json();
      if (!data.success) { alert(data.error); return; }
      await Promise.all([fetchSkills(), fetchStaging()]);
    } catch {
      alert("网络错误");
    } finally {
      setPublishingName(null);
    }
  }

  async function handleReReview(name: string) {
    setReviewingName(name);
    try {
      const res = await fetch(`/api/skills/staging/${name}/review`, { method: "POST" });
      const data = await res.json();
      if (!data.success) { alert(data.error); return; }
      await fetchStaging();
    } catch {
      alert("网络错误");
    } finally {
      setReviewingName(null);
    }
  }

  async function handleDiscard(name: string) {
    if (!confirm(`确定放弃 "${name}"？此操作不可逆。`)) return;
    await fetch(`/api/skills/${name}`, { method: "DELETE" });
    await fetchStaging();
  }

  async function handleToggleMount(agentKey: string, skillName: string) {
    const current = mounts[agentKey] ?? [];
    const next = current.includes(skillName)
      ? current.filter((s) => s !== skillName)
      : [...current, skillName];
    const newMounts = { ...mounts, [agentKey]: next };
    await fetch("/api/skills/mounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mounts: newMounts }),
    });
    setMounts(newMounts);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
      </div>
    );
  }

  const agentKeys = Object.keys(mounts);

  return (
    <div className="space-y-6">
      {/* 安全提示 */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <span>
          安装 Skill 即引入可执行代码，请仅从信任来源安装。Skill
          代码在服务器本机执行，可读取 Skill 文件但无宿主环境变量。
        </span>
      </div>

      {/* Staging 待审查区 */}
      {stagingItems.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">待审查</h3>
          {stagingItems.map((item) => (
            <Card
              key={item.name}
              className={
                item.review.verdict === "reject" && item.review.status === "rejected"
                  ? "border-destructive/30"
                  : "border-amber-500/30"
              }
            >
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{item.name}</span>
                      <span className="text-xs text-muted-foreground">v{item.version}</span>
                      {item.review.status === "pending" && (
                        <Badge variant="secondary">
                          <Loader2 className="h-3 w-3 animate-spin" /> 待审查
                        </Badge>
                      )}
                      {item.review.status === "passed" && (
                        <Badge variant="default">
                          <CheckCircle className="h-3 w-3" /> 审查通过
                        </Badge>
                      )}
                      {item.review.status === "rejected" && (
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3" /> 审查未通过
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    <div className="mt-1 text-xs text-muted-foreground">
                      来源:{" "}
                      <code className="rounded bg-muted px-1 text-xs">{item.sourceUrl}</code>
                    </div>

                    {item.review.summary && (
                      <p className="mt-2 text-sm">{item.review.summary}</p>
                    )}

                    {item.review.verdict === "reject" && item.review.issues.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {item.review.issues.map((issue, i) => (
                          <div key={i} className="rounded-md bg-destructive/10 p-2 text-xs">
                            <span className="font-medium">
                              [{issue.dimension === "security" ? "安全" : issue.dimension === "execution_scope" ? "执行边界" : "协议"}]
                            </span>
                            {issue.file && (
                              <span className="ml-1 font-mono text-muted-foreground">{issue.file}</span>
                            )}
                            <span className="ml-1">{issue.description}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {item.review.reviewedAt && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        审查时间: {new Date(item.review.reviewedAt).toLocaleString("zh-CN")}
                      </div>
                    )}
                  </div>

                  <div className="ml-4 flex shrink-0 items-center gap-1">
                    {item.review.verdict === "pass" && (
                      <Button
                        size="sm"
                        onClick={() => handlePublish(item.name)}
                        disabled={publishingName === item.name}
                      >
                        {publishingName === item.name ? "安装中..." : "安装"}
                      </Button>
                    )}
                    {item.review.verdict === "reject" && item.review.status === "rejected" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReReview(item.name)}
                        disabled={reviewingName === item.name}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {reviewingName === item.name ? "审查中..." : "重新审查"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => handleDiscard(item.name)}
                      title="放弃"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 安装区 */}
      <Card>
        <CardContent className="flex gap-2 pt-4">
          <Input
            type="url"
            placeholder="GitHub 仓库 URL（如 https://github.com/simonlin1212/a-stock-data）"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={handleInstall}
            disabled={installing || !url.trim()}
          >
            <Download className="h-4 w-4" />
            {installing ? "安装中..." : "安装"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* 已装列表 */}
      {skills.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            暂无已安装的 Skill
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => (
            <Card key={skill.name}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{skill.name}</span>
                      <span className="text-xs text-muted-foreground">
                        v{skill.version}
                      </span>
                      {skill.enabled ? (
                        <Badge variant="default">
                          <CheckCircle className="h-3 w-3" />
                          已启用
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="h-3 w-3" />
                          已禁用
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {skill.description}
                    </p>
                    <div className="mt-1 text-xs text-muted-foreground">
                      来源:{" "}
                      <code className="rounded bg-muted px-1 text-xs">
                        {skill.sourceUrl}
                      </code>
                    </div>
                  </div>
                  <div className="ml-4 flex shrink-0 items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggle(skill.name, skill.enabled)}
                    >
                      {skill.enabled ? "禁用" : "启用"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleCheckUpdate(skill.name)}
                      title="检查更新"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Dialog
                      open={deleteTarget === skill.name}
                      onOpenChange={(open) => {
                        if (!open) setDeleteTarget(null);
                      }}
                    >
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(skill.name)}
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>确认删除</DialogTitle>
                          <DialogDescription>
                            确定要删除 Skill &quot;{skill.name}&quot;？此操作不可逆。
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose>
                            <Button variant="outline">取消</Button>
                          </DialogClose>
                          <Button
                            variant="destructive"
                            onClick={() => handleDelete(skill.name)}
                          >
                            删除
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                {/* 挂载勾选 */}
                {agentKeys.length > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <span className="text-xs font-medium">挂载到 Agent：</span>
                    <div className="mt-1 flex flex-wrap gap-3">
                      {agentKeys.map((ak) => (
                        <label
                          key={ak}
                          className="inline-flex items-center gap-1.5 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={(mounts[ak] ?? []).includes(skill.name)}
                            onChange={() => handleToggleMount(ak, skill.name)}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          {ak}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
