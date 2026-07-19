// src/services/scheduler/jobs/scan.ts
import { listEnabledBloggers } from "@/services/douyin/blogger-service";
import { scanBlogger } from "@/services/douyin/scanner-service";

export async function runScanJob(): Promise<{ summary: string }> {
  const list = await listEnabledBloggers();
  let newWorks = 0;
  for (const b of list) {
    const r = await scanBlogger(b);
    newWorks += r.newWorks;
  }
  return { summary: `扫描完成，新增 ${newWorks} 条` };
}
