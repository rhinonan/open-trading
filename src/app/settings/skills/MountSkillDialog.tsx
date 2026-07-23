"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AGENT_KEYS } from "@/mastra/agent-meta";

function MountSkillDialogBody({
  skillName,
  mounts,
  onOpenChange,
  onSave,
}: {
  skillName: string;
  mounts: Record<string, string[]>;
  onOpenChange: (v: boolean) => void;
  onSave: (next: Record<string, string[]>) => Promise<void>;
}) {
  const agentKeys = useMemo(() => {
    const keys = new Set<string>([...AGENT_KEYS, ...Object.keys(mounts)]);
    return Array.from(keys);
  }, [mounts]);

  const [selected, setSelected] = useState(
    () =>
      new Set(
        agentKeys.filter((ak) => (mounts[ak] ?? []).includes(skillName)),
      ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const next: Record<string, string[]> = { ...mounts };
      for (const ak of agentKeys) {
        const set = new Set(next[ak] ?? []);
        if (selected.has(ak)) set.add(skillName);
        else set.delete(skillName);
        next[ak] = Array.from(set);
      }
      await onSave(next);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>挂载到 Agent</DialogTitle>
          <DialogDescription>
            选择要挂载 Skill「{skillName}」的 Agent（仍需在表格中启用该 Skill
            才会注入）
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {agentKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无 Agent 挂载配置</p>
          ) : (
            agentKeys.map((ak) => (
              <div key={ak} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={`mount-${ak}`}
                  checked={selected.has(ak)}
                  disabled={busy}
                  onCheckedChange={() => {
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (n.has(ak)) n.delete(ak);
                      else n.add(ak);
                      return n;
                    });
                  }}
                />
                <Label htmlFor={`mount-${ak}`} className="font-normal cursor-pointer">
                  {ak}
                </Label>
              </div>
            ))
          )}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void confirm();
            }}
          >
            {busy ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  if (!open) return null;
  // key 在打开时重置勾选状态
  return (
    <MountSkillDialogBody
      key={skillName}
      skillName={skillName}
      mounts={mounts}
      onOpenChange={onOpenChange}
      onSave={onSave}
    />
  );
}
