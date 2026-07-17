"use client";

import { useState } from "react";
import {
  UserPlus,
  RefreshCw,
  Video,
  Mic,
  Lightbulb,
  BarChart3,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddBloggerDialog } from "./AddBloggerDialog";

type ToolbarAction =
  | "update-profile"
  | "scan"
  | "transcribe"
  | "summarize"
  | "evaluate";

export function BloggerToolbar({
  selectedCount,
  totalCount,
  onAction,
  processingAction,
  onBloggerAdded,
}: {
  selectedCount: number;
  totalCount: number;
  onAction: (action: ToolbarAction) => void;
  processingAction: ToolbarAction | null;
  onBloggerAdded: () => void;
}) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: ToolbarAction;
    label: string;
  }>({ open: false, action: "scan", label: "" });

  const ACTION_LABELS: Record<ToolbarAction, string> = {
    "update-profile": "更新博主信息",
    scan: "更新博主视频",
    transcribe: "转写视频",
    summarize: "提取观点",
    evaluate: "评判",
  };

  const handleClick = (action: ToolbarAction) => {
    if (selectedCount === 0) {
      // No selection — confirm to operate on ALL
      setConfirmDialog({
        open: true,
        action,
        label: ACTION_LABELS[action],
      });
    } else {
      onAction(action);
    }
  };

  const handleConfirmAll = () => {
    onAction(confirmDialog.action);
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const isProcessing = (action: ToolbarAction) => processingAction === action;

  return (
    <TooltipProvider delay={300}>
      <div className="flex flex-wrap items-center gap-2">
        {/* 添加博主 */}
        <Button onClick={() => setAddDialogOpen(true)} size="sm">
          <UserPlus className="h-4 w-4 mr-1.5" />
          添加博主
        </Button>

        {/* 分隔 */}
        <div className="w-px h-6 bg-border mx-1" />

        {/* 更新博主信息 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleClick("update-profile")}
          disabled={processingAction !== null}
        >
          {isProcessing("update-profile") ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1.5" />
          )}
          更新博主信息
        </Button>

        {/* 更新博主视频 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleClick("scan")}
          disabled={processingAction !== null}
        >
          {isProcessing("scan") ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Video className="h-4 w-4 mr-1.5" />
          )}
          更新博主视频
        </Button>

        {/* 转写视频 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleClick("transcribe")}
          disabled={processingAction !== null}
        >
          {isProcessing("transcribe") ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Mic className="h-4 w-4 mr-1.5" />
          )}
          转写视频
        </Button>

        {/* 提取观点 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleClick("summarize")}
          disabled={processingAction !== null}
        >
          {isProcessing("summarize") ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Lightbulb className="h-4 w-4 mr-1.5" />
          )}
          提取观点
        </Button>

        {/* 评判 — 置灰 */}
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Button
              variant="outline"
              size="sm"
              disabled
              className="opacity-50 cursor-not-allowed"
            >
              <BarChart3 className="h-4 w-4 mr-1.5" />
              评判
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            ASR 流水线就绪后启用
          </TooltipContent>
        </Tooltip>

        {/* 选中提示 */}
        {selectedCount > 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            已选 {selectedCount}/{totalCount} 位博主
          </span>
        )}
      </div>

      {/* 确认操作全部博主弹窗 */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认操作</DialogTitle>
            <DialogDescription>
              未选择任何博主，将对<strong>全部 {totalCount} 位</strong>博主执行「{confirmDialog.label}」操作。是否继续？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
            >
              取消
            </Button>
            <Button onClick={handleConfirmAll}>
              确认执行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加博主弹窗 */}
      <AddBloggerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdded={onBloggerAdded}
      />
    </TooltipProvider>
  );
}
