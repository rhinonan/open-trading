// src/lib/data-root.ts
// 数据根目录单点：所有落盘路径（业务库、缓存、音视频、workspace、skills）统一从这里取。
// 桌面端/容器部署只需设置 DATA_ROOT 环境变量即可整体迁移数据目录。
// 注意：每次调用时读 env（而非模块加载时冻结），便于测试与运行时诊断。
import path from "path";

export function getDataRoot(): string {
  return process.env.DATA_ROOT || path.join(process.cwd(), "data");
}

/** 拼出 data 根目录下的子路径，如 dataPath("api-cache")、dataPath("workspace", "evaluator") */
export function dataPath(...segments: string[]): string {
  return path.join(getDataRoot(), ...segments);
}
