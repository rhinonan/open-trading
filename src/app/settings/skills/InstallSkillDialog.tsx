"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Step = 1 | 2 | 3;

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

interface SkillCandidate {
  name: string;
  description: string;
  version: string;
  sourcePath: string;
}

interface StagingBatch {
  batchId: string;
  sourceUrl: string;
  installedAt: string;
  candidates: SkillCandidate[];
  review: SkillReviewResult;
}

function dimensionLabel(d: ReviewIssue["dimension"]) {
  if (d === "security") return "安全";
  if (d === "execution_scope") return "执行边界";
  return "协议";
}

function Stepper({ step }: { step: Step }) {
  const labels = ["来源", "审查", "安装"];
  return (
    <div className="mb-4 flex items-center gap-2 text-xs">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={
                "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] " +
                (active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-primary text-primary"
                    : "text-muted-foreground")
              }
            >
              {n}
            </div>
            <span className={active ? "font-medium" : "text-muted-foreground"}>
              {label}
            </span>
            {i < labels.length - 1 && (
              <div className="mx-1 h-px w-6 bg-border" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function InstallSkillDialog({
  open,
  onOpenChange,
  onInstalled,
  mode = "create",
  initialUrl = "",
  overwrite = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: () => void;
  mode?: "create" | "update";
  initialUrl?: string;
  overwrite?: boolean;
}) {
  const [step, setStep] = useState<Step>(1);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, setBatch] = useState<StagingBatch | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setUrl(initialUrl);
    setBusy(false);
    setError("");
    setBatchId(null);
    setBatch(null);
    setSelected(new Set());
  }, [open, initialUrl]);

  async function startInstall() {
    if (!url.trim()) return;
    setBusy(true);
    setError("");
    setStep(2);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          // create / update 均 force，避免残留 staging 挡道
          force: true,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "下载/审查失败");
        setStep(1);
        return;
      }
      const b = data.batch as StagingBatch;
      setBatch(b);
      setBatchId(b.batchId);
      const names = (b.candidates ?? []).map((c) => c.name);
      setSelected(new Set(names));
      if (b.review?.verdict === "pass") {
        setStep(3);
      } else {
        setStep(2);
      }
    } catch {
      setError("网络错误");
      setStep(1);
    } finally {
      setBusy(false);
    }
  }

  async function reReview() {
    if (!batchId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/skills/staging/${batchId}/review`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "审查失败");
        return;
      }
      const st = await fetch("/api/skills/staging");
      const stData = await st.json();
      const b = (stData.staging ?? []).find(
        (x: StagingBatch) => x.batchId === batchId,
      ) as StagingBatch | undefined;
      if (b) {
        setBatch(b);
        if (b.review?.verdict === "pass") {
          setSelected(new Set(b.candidates.map((c) => c.name)));
          setStep(3);
        }
      }
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!batchId) return;
    const names = Array.from(selected);
    if (names.length === 0) {
      setError("请至少选择一个 Skill");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/skills/staging/${batchId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          names,
          overwrite: overwrite || mode === "update",
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "安装失败");
        return;
      }
      if (data.errors?.length) {
        alert(
          Array.isArray(data.errors)
            ? data.errors
                .map((e: string | { message?: string }) =>
                  typeof e === "string" ? e : (e.message ?? String(e)),
                )
                .join("\n")
            : String(data.errors),
        );
      }
      onOpenChange(false);
      onInstalled();
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function discardAndClose() {
    if (batchId) {
      try {
        await fetch(`/api/skills/${batchId}`, { method: "DELETE" });
      } catch {
        // ignore discard errors on close
      }
    }
    onOpenChange(false);
  }

  function toggleCandidate(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const title = mode === "update" ? "更新 Skill" : "安装 Skill";
  const review = batch?.review;
  const rejected =
    review &&
    (review.verdict === "reject" || review.status === "rejected");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          void discardAndClose();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "update"
              ? "从源仓库重新拉取并覆盖已安装版本"
              : "从 GitHub 仓库下载 Skill，经审查后安装"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            安装 Skill 即引入可执行代码，请仅从信任来源安装。Skill
            代码在服务器本机执行，可读取 Skill 文件但无宿主环境变量。
          </span>
        </div>

        <Stepper step={step} />

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <label className="text-sm font-medium" htmlFor="skill-source-url">
              仓库 URL
            </label>
            <Input
              id="skill-source-url"
              type="url"
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy && url.trim()) {
                  void startInstall();
                }
              }}
              disabled={busy || (mode === "update" && !!initialUrl)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              支持公开 GitHub 仓库地址；安装前会自动跑安全审查。
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {busy && !batch ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                正在下载并审查…
              </div>
            ) : batch ? (
              <>
                <div className="flex items-center gap-2 text-sm">
                  {rejected ? (
                    <>
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="font-medium text-destructive">
                        审查未通过
                      </span>
                    </>
                  ) : review?.verdict === "pass" ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-primary" />
                      <span className="font-medium">审查通过</span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-muted-foreground">审查中…</span>
                    </>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  批次{" "}
                  <code className="rounded bg-muted px-1">{batch.batchId}</code>
                  {" · "}
                  来源{" "}
                  <code className="rounded bg-muted px-1 break-all">
                    {batch.sourceUrl}
                  </code>
                </div>

                {review?.summary && (
                  <p className="text-sm">{review.summary}</p>
                )}

                {batch.candidates.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium">
                      包含 {batch.candidates.length} 个 Skill
                    </span>
                    {batch.candidates.map((c) => (
                      <div
                        key={c.name}
                        className="flex items-baseline gap-2 text-sm"
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">
                          v{c.version}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          — {c.description}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {rejected && review.issues?.length > 0 && (
                  <div className="max-h-48 space-y-1 overflow-auto">
                    {review.issues.map((issue, i) => (
                      <div
                        key={i}
                        className="rounded-md bg-destructive/10 p-2 text-xs"
                      >
                        <span className="font-medium">
                          [{dimensionLabel(issue.dimension)}]
                        </span>
                        {issue.file && (
                          <span className="ml-1 font-mono text-muted-foreground">
                            {issue.file}
                          </span>
                        )}
                        <span className="ml-1">{issue.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                暂无审查结果
              </p>
            )}
          </div>
        )}

        {step === 3 && batch && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span className="font-medium">审查通过，选择要安装的 Skill</span>
            </div>
            {review?.summary && (
              <p className="text-sm text-muted-foreground">{review.summary}</p>
            )}
            <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-3">
              {batch.candidates.map((c) => (
                <label
                  key={c.name}
                  className="flex cursor-pointer items-start gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.name)}
                    onChange={() => toggleCandidate(c.name)}
                    className="mt-0.5 h-3.5 w-3.5 accent-primary"
                    disabled={busy}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      v{c.version}
                    </span>
                    {c.description && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {c.description}
                      </span>
                    )}
                  </span>
                </label>
              ))}
              {batch.candidates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  此批次没有可安装的 Skill
                </p>
              )}
            </div>
            {(overwrite || mode === "update") && (
              <p className="text-xs text-muted-foreground">
                更新模式将覆盖同名已安装 Skill。
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 1 && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                取消
              </Button>
              <Button
                onClick={() => void startInstall()}
                disabled={busy || !url.trim()}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    处理中…
                  </>
                ) : (
                  "下一步"
                )}
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <Button
                variant="outline"
                onClick={() => void discardAndClose()}
                disabled={busy}
              >
                放弃
              </Button>
              {rejected && (
                <Button
                  variant="outline"
                  onClick={() => void reReview()}
                  disabled={busy || !batchId}
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      审查中…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      重新审查
                    </>
                  )}
                </Button>
              )}
              {review?.verdict === "pass" && (
                <Button onClick={() => setStep(3)} disabled={busy}>
                  继续安装
                </Button>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <Button
                variant="outline"
                onClick={() => void discardAndClose()}
                disabled={busy}
              >
                放弃
              </Button>
              <Button
                onClick={() => void publish()}
                disabled={busy || selected.size === 0}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    安装中…
                  </>
                ) : (
                  `安装选中（${selected.size}）`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
