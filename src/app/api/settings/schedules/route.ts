// src/app/api/settings/schedules/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSetting, setSetting } from "@/services/settings-service";
import { parseCron, describeCronNext } from "@/lib/cron-matcher";
import {
  ensureSchedulerStarted,
  JOB_DEFINITIONS,
  type ScheduleJobId,
} from "@/services/scheduler";

const IDS = new Set(JOB_DEFINITIONS.map((j) => j.id));

async function readJob(def: (typeof JOB_DEFINITIONS)[number]) {
  const enabledStr =
    (await getSetting(`schedule.${def.id}.enabled`)) ??
    (def.defaultEnabled ? "true" : "false");
  const cron =
    (await getSetting(`schedule.${def.id}.cron`)) ?? def.defaultCron;
  const lastRunRaw = await getSetting(`schedule.${def.id}.last_run_at`);
  const lastError = await getSetting(`schedule.${def.id}.last_error`);
  let nextRun = "";
  try {
    nextRun = describeCronNext(parseCron(cron));
  } catch {
    nextRun = "cron 无效";
  }
  return {
    id: def.id,
    label: def.label,
    description: def.description,
    enabled: enabledStr === "true",
    cron,
    lastRunAt: lastRunRaw ? parseInt(lastRunRaw, 10) : null,
    lastError: lastError || null,
    nextRun,
  };
}

export async function GET() {
  ensureSchedulerStarted();
  try {
    const jobs = await Promise.all(JOB_DEFINITIONS.map(readJob));
    return Response.json({ success: true, jobs });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "获取失败" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  ensureSchedulerStarted();
  try {
    const body = await req.json();
    const id = body.id as ScheduleJobId;
    if (!IDS.has(id)) {
      return Response.json({ success: false, error: "未知 job" }, { status: 400 });
    }
    if (body.cron !== undefined) {
      if (typeof body.cron !== "string" || body.cron.trim().split(/\s+/).length !== 5) {
        return Response.json({ success: false, error: "cron 格式需为 5 字段" }, { status: 400 });
      }
      parseCron(body.cron.trim()); // 抛错则 400
      await setSetting(`schedule.${id}.cron`, body.cron.trim());
    }
    if (body.enabled !== undefined) {
      await setSetting(`schedule.${id}.enabled`, body.enabled ? "true" : "false");
    }
    const def = JOB_DEFINITIONS.find((j) => j.id === id)!;
    const job = await readJob(def);
    return Response.json({ success: true, job });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "保存失败" },
      { status: 400 }
    );
  }
}
