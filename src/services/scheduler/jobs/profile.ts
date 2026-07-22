// src/services/scheduler/jobs/profile.ts
import { listEnabledBloggers, updateBloggerProfile } from "@/services/douyin/blogger-service";

export async function runProfileJob(): Promise<{ summary: string }> {
  const list = await listEnabledBloggers();
  let ok = 0;
  const failures: string[] = [];
  for (const b of list) {
    try {
      await updateBloggerProfile(b.slug);
      ok++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push(`${b.nickname}: ${reason}`);
    }
  }
  const parts = [`${ok} 成功`];
  if (failures.length > 0) {
    parts.push(`${failures.length} 失败`);
  }
  return { summary: `资料更新 ${parts.join(" / ")}` };
}
