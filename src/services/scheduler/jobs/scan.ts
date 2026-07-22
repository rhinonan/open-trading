// src/services/scheduler/jobs/scan.ts
import { listEnabledBloggers } from "@/services/douyin/blogger-service";
import { scanBlogger } from "@/services/douyin/scanner-service";

export async function runScanJob(): Promise<{ summary: string }> {
  const list = await listEnabledBloggers();
  let newWorks = 0;
  const errors: string[] = [];
  for (const b of list) {
    const r = await scanBlogger(b);
    newWorks += r.newWorks;
    if (r.errors.length > 0) {
      errors.push(`${b.nickname}: ${r.errors.join("; ")}`);
    }
  }
  const parts = [`新增 ${newWorks} 条`];
  if (errors.length > 0) {
    parts.push(`${errors.length} 个博主出错`);
  }
  return { summary: `扫描 ${parts.join("，")}` };
}
