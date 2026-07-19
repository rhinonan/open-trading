// src/services/scheduler/jobs/profile.ts
import { listEnabledBloggers, updateBloggerProfile } from "@/services/douyin/blogger-service";

export async function runProfileJob(): Promise<{ summary: string }> {
  const list = await listEnabledBloggers();
  let ok = 0;
  let fail = 0;
  for (const b of list) {
    try {
      await updateBloggerProfile(b.slug);
      ok++;
    } catch {
      fail++;
    }
  }
  return { summary: `资料更新 ${ok} 成功 / ${fail} 失败` };
}
