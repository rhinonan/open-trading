"use client";

import { Github, RefreshCw, Trash2, Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SkillRow } from "./types";

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
      <table className="w-full">
        <thead>
          <tr className="border-b text-xs text-muted-foreground bg-background">
            <th className="text-left font-medium py-2 pl-4">名称</th>
            <th className="text-left font-medium py-2 w-20">版本</th>
            <th className="text-left font-medium py-2">描述</th>
            <th className="text-left font-medium py-2 w-28">协议</th>
            <th className="text-left font-medium py-2 w-12">源</th>
            <th className="text-left font-medium py-2 w-24">commit</th>
            <th className="text-left font-medium py-2 w-16">启用</th>
            <th className="text-left font-medium py-2 pr-4 w-40">操作</th>
          </tr>
        </thead>
        <tbody>
          {skills.map((s) => (
            <tr key={s.name} className="border-b last:border-0 text-sm">
              <td className="py-2 pl-4 font-medium">{s.name}</td>
              <td className="py-2 text-muted-foreground">v{s.version}</td>
              <td className="py-2 max-w-xs truncate text-muted-foreground" title={s.description}>
                {s.description}
              </td>
              <td className="py-2 text-muted-foreground">{s.license ?? "—"}</td>
              <td className="py-2">
                {s.sourceUrl ? (
                  <a
                    href={s.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex text-muted-foreground hover:text-foreground"
                    title={s.sourceUrl}
                  >
                    <Github className="h-4 w-4" />
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2 font-mono text-xs text-muted-foreground" title={s.commit ?? undefined}>
                {s.commitShort ?? "—"}
              </td>
              <td className="py-2">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={() => onToggle(s.name, s.enabled)}
                  className="h-3.5 w-3.5 accent-primary"
                  title={s.enabled ? "点击禁用" : "点击启用"}
                />
              </td>
              <td className="py-2 pr-4">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => onUpdate(s)} title="更新">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => onMount(s)} title="挂载">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
