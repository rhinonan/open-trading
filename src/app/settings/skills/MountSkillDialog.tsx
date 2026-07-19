"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function MountSkillDialog({
  open,
  onOpenChange,
  skillName,
  mounts,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  skillName: string;
  mounts: Record<string, string[]>;
  onSave: (next: Record<string, string[]>) => Promise<void>;
}) {
  const agentKeys = Object.keys(mounts);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const init = new Set(
      agentKeys.filter((ak) => (mounts[ak] ?? []).includes(skillName))
    );
    setSelected(init);
  }, [open, skillName, mounts]); // mounts 引用变化时重置

  async function confirm() {
    setBusy(true);
    try {
      const next = { ...mounts };
      for (const ak of agentKeys) {
        const set = new Set(next[ak] ?? []);
        if (selected.has(ak)) set.add(skillName);
        else set.delete(skillName);
        next[ak] = Array.from(set);
      }
      await onSave(next);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>挂载到 Agent</DialogTitle>
          <DialogDescription>
            选择要挂载 Skill「{skillName}」的 Agent（仍需在表格中启用该 Skill 才会注入）
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {agentKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无 Agent 挂载配置</p>
          ) : (
            agentKeys.map((ak) => (
              <label key={ak} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={selected.has(ak)}
                  onChange={() => {
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (n.has(ak)) n.delete(ak);
                      else n.add(ak);
                      return n;
                    });
                  }}
                />
                {ak}
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={confirm} disabled={busy}>
            {busy ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
