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

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [url, setUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");
  const [mounts, setMounts] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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

  useEffect(() => {
    Promise.all([fetchSkills(), fetchMounts()]).finally(() =>
      setLoading(false)
    );
  }, [fetchSkills, fetchMounts]);

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
      await fetchSkills();
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
