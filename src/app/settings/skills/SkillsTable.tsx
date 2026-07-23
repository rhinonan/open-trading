"use client";

import { RefreshCw, Trash2, Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { SkillRow } from "./types";

// lucide-react 已移除品牌图标，与 header 一致内联 GitHub mark
function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function SkillsTable({
  skills,
  onToggle,
  onUpdate,
  onMount,
  onDelete,
}: {
  skills: SkillRow[];
  onToggle: (name: string, enabled: boolean) => void;
  onUpdate: (skill: SkillRow) => void;
  onMount: (skill: SkillRow) => void;
  onDelete: (skill: SkillRow) => void;
}) {
  if (skills.length === 0) {
    return (
      <div className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
        暂无已安装的 Skill
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="text-xs text-muted-foreground bg-background hover:bg-background">
            <TableHead className="pl-4">名称</TableHead>
            <TableHead className="w-20">版本</TableHead>
            <TableHead>描述</TableHead>
            <TableHead className="w-28">协议</TableHead>
            <TableHead className="w-12">源</TableHead>
            <TableHead className="w-24">commit</TableHead>
            <TableHead className="w-16">启用</TableHead>
            <TableHead className="pr-4 w-40">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {skills.map((s) => (
            <TableRow key={s.name}>
              <TableCell className="pl-4 font-medium">{s.name}</TableCell>
              <TableCell className="text-muted-foreground">v{s.version}</TableCell>
              <TableCell
                className="max-w-xs truncate text-muted-foreground"
                title={s.description}
              >
                {s.description}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {s.license ?? "—"}
              </TableCell>
              <TableCell>
                {s.sourceUrl ? (
                  <a
                    href={s.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex text-muted-foreground hover:text-foreground"
                    title={s.sourceUrl}
                  >
                    <GithubIcon className="h-4 w-4" />
                  </a>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell
                className="font-mono text-xs text-muted-foreground"
                title={s.commit ?? undefined}
              >
                {s.commitShort ?? "—"}
              </TableCell>
              <TableCell>
                <Switch
                  size="sm"
                  checked={s.enabled}
                  onCheckedChange={() => onToggle(s.name, s.enabled)}
                  title={s.enabled ? "点击禁用" : "点击启用"}
                />
              </TableCell>
              <TableCell className="pr-4">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onUpdate(s)}
                    title="更新"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onMount(s)}
                    title="挂载"
                  >
                    <Cable className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(s)}
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
