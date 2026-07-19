"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Settings, Sun, Moon, Monitor, Cpu, Loader2 } from "lucide-react";
import { DEFAULT_LLM_MODEL } from "@/lib/llm-constants";

interface LlmSettings {
  opinionModel: string;
  evaluationModel: string;
  skillsReviewModel: string;
  imageOpinionModel: string;
}

const MODEL_FIELDS: { field: keyof LlmSettings; label: string; hint: string }[] = [
  { field: "opinionModel", label: "观点提取模型", hint: "转写文本 → 一句话观点摘要" },
  { field: "imageOpinionModel", label: "图集观点提取模型", hint: "图集图片 → vision 模型分析 → 一句话观点摘要" },
  { field: "evaluationModel", label: "收盘评判模型", hint: "预测 vs 实际行情评判（功能待启用）" },
  { field: "skillsReviewModel", label: "Skills 审查模型", hint: "Skill 安装时的安全/协议/执行边界审查" },
];

export default function SettingsPage() {
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState("");
  const [llmSettings, setLlmSettings] = useState<LlmSettings | null>(null);
  const [llmLoading, setLlmLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [llmMessage, setLlmMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [modelsResult, settingsResult] = await Promise.allSettled([
          fetch("/api/llm/models"),
          fetch("/api/settings/llm"),
        ]);

        if (modelsResult.status === "fulfilled" && modelsResult.value.ok) {
          const data = await modelsResult.value.json();
          const modelList = data.models ?? [];
          setModels(modelList);
          if (modelList.length === 0) setModelsError("暂无可用模型");
        } else {
          let msg = "无法获取模型列表";
          if (modelsResult.status === "fulfilled") {
            try {
              const data = await modelsResult.value.json();
              if (data.error) msg = `无法获取模型列表: ${data.error}`;
            } catch { /* 保留默认提示 */ }
          }
          setModelsError(msg);
        }

        if (settingsResult.status === "fulfilled" && settingsResult.value.ok) {
          setLlmSettings(await settingsResult.value.json());
        }
      } finally {
        setLlmLoading(false);
      }
    })();
  }, []);

  const handleModelChange = async (field: keyof LlmSettings, value: string) => {
    if (!llmSettings || value === llmSettings[field]) return;
    setSaving(true);
    setLlmMessage("");
    try {
      const res = await fetch("/api/settings/llm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (res.ok) {
        setLlmSettings(data);
        setLlmMessage(`已保存：${value}`);
      } else {
        setLlmMessage(`保存失败: ${data.error}`);
      }
    } catch {
      setLlmMessage("保存失败，请检查网络");
    }
    setSaving(false);
  };

  const llmError = modelsError || (!llmSettings && !llmLoading ? "无法加载模型设置" : "");

  return (
    <div className="space-y-6">
      {/* 外观设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">主题偏好</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 rounded-md border p-1">
                <Sun className="h-4 w-4 text-muted-foreground" />
                <Moon className="h-4 w-4 text-muted-foreground" />
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">切换主题</p>
                <p className="text-xs text-muted-foreground">
                  选择亮色、暗色或跟随系统
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

      {/* LLM 模型设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            LLM 模型
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {llmLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
            </p>
          ) : (
            <>
              {MODEL_FIELDS.map(({ field, label, hint }) => (
                <div key={field} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                  {modelsError || models.length === 0 || !llmSettings ? (
                    <span className="text-sm text-muted-foreground font-mono">
                      {llmSettings?.[field] ?? DEFAULT_LLM_MODEL}
                    </span>
                  ) : (
                    <select
                      value={llmSettings?.[field] ?? ""}
                      disabled={saving}
                      onChange={(e) => handleModelChange(field, e.target.value)}
                      className="max-w-[280px] rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {/* 已保存模型不在列表中时也要可见 */}
                      {llmSettings && !models.includes(llmSettings[field]) && (
                        <option value={llmSettings[field]}>{llmSettings[field]}</option>
                      )}
                      {models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
              {llmError && (
                <p className="text-sm text-danger bg-muted/50 rounded-md p-3">{llmError}</p>
              )}
              {llmMessage && (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">{llmMessage}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 更多设置占位 */}
      <Card className="flex items-center justify-center min-h-[100px] border-dashed">
        <CardContent className="text-center py-8">
          <Settings className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">更多设置即将上线</p>
        </CardContent>
      </Card>
    </div>
  );
}
