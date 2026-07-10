import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Settings, Sun, Moon, Monitor } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">设置</h1>
        <p className="text-muted-foreground mt-1">
          管理主题偏好、通知与数据源配置
        </p>
      </div>

      {/* Theme setting */}
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

      {/* Placeholder */}
      <Card className="flex items-center justify-center min-h-[200px] border-dashed">
        <CardContent className="text-center py-12">
          <Settings className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">更多设置即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            通知管理、API Key 配置、数据源设置等功能将在后续版本添加
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
