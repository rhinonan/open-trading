"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AddBloggerDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [uidInput, setUidInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const handleAdd = async () => {
    if (!uidInput.trim()) return;
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/douyin/bloggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ douyinUid: uidInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setUidInput("");
        onOpenChange(false);
        onAdded();
      } else {
        setError(data.error || "添加失败");
      }
    } catch {
      setError("网络请求失败");
    }
    setAdding(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加抖音博主</DialogTitle>
          <DialogDescription>
            输入博主的抖音 sec_uid 来添加监控
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            type="text"
            value={uidInput}
            onChange={(e) => {
              setUidInput(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="输入抖音博主 sec_uid..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleAdd} disabled={adding || !uidInput.trim()}>
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                添加中...
              </>
            ) : (
              "添加"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
