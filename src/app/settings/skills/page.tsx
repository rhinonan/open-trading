"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { SkillsTable } from "./SkillsTable";
import { InstallSkillDialog } from "./InstallSkillDialog";
import { MountSkillDialog } from "./MountSkillDialog";
import type { SkillRow } from "./types";

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [mounts, setMounts] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [installOpen, setInstallOpen] = useState(false);
  const [installMode, setInstallMode] = useState<"create" | "update">("create");
  const [installUrl, setInstallUrl] = useState("");
  const [mountTarget, setMountTarget] = useState<SkillRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SkillRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [sRes, mRes] = await Promise.all([
      fetch("/api/skills"),
      fetch("/api/skills/mounts"),
    ]);
    const sData = await sRes.json();
    const mData = await mRes.json();
    if (sData.success) setSkills(sData.skills);
    if (mData.success) setMounts(mData.mounts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sRes, mRes] = await Promise.all([
          fetch("/api/skills"),
          fetch("/api/skills/mounts"),
        ]);
        const sData = await sRes.json();
        const mData = await mRes.json();
        if (cancelled) return;
        if (sData.success) setSkills(sData.skills);
        if (mData.success) setMounts(mData.mounts);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(name: string, currentEnabled: boolean) {
    await fetch(`/api/skills/${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: currentEnabled ? "disable" : "enable",
      }),
    });
    await refresh();
  }

  async function handleUpdate(skill: SkillRow) {
    setMessage(null);
    try {
      const res = await fetch(
        `/api/skills/${encodeURIComponent(skill.name)}/check-update`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!data.success) {
        setMessage(data.error || "检查更新失败");
        return;
      }
      if (!data.hasUpdate) {
        setMessage("已是最新");
        return;
      }
      setMessage(`发现新版本 ${data.latestVersion}，请在向导中安装`);
      setInstallMode("update");
      setInstallUrl(skill.sourceUrl ?? "");
      setInstallOpen(true);
    } catch {
      setMessage("检查更新失败");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/skills/${encodeURIComponent(deleteTarget.name)}`, {
        method: "DELETE",
      });
      setDeleteTarget(null);
      await refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Skills</h2>
        <Button
          size="sm"
          onClick={() => {
            setInstallMode("create");
            setInstallUrl("");
            setInstallOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          添加 Skill
        </Button>
      </div>

      {message && (
        <div className="rounded-md bg-muted p-2 text-sm">{message}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <SkillsTable
          skills={skills}
          onToggle={handleToggle}
          onUpdate={handleUpdate}
          onMount={setMountTarget}
          onDelete={setDeleteTarget}
        />
      )}

      <InstallSkillDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        onInstalled={() => {
          setMessage(null);
          void refresh();
        }}
        mode={installMode}
        initialUrl={installUrl}
        overwrite={installMode === "update"}
      />

      {mountTarget && (
        <MountSkillDialog
          open={!!mountTarget}
          onOpenChange={(v) => {
            if (!v) setMountTarget(null);
          }}
          skillName={mountTarget.name}
          mounts={mounts}
          onSave={async (next) => {
            await fetch("/api/skills/mounts", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mounts: next }),
            });
            setMounts(next);
          }}
        />
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除 Skill &quot;{deleteTarget?.name}&quot;？此操作不可逆。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline" disabled={deleting}>
                取消
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
