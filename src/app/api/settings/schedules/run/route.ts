// src/app/api/settings/schedules/run/route.ts
import { jsonError } from "@/lib/api-error";
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  ensureSchedulerStarted,
  getScheduler,
  JOB_DEFINITIONS,
  type ScheduleJobId,
} from "@/services/scheduler";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  ensureSchedulerStarted();
  try {
    const { id } = (await req.json()) as { id: ScheduleJobId };
    if (!JOB_DEFINITIONS.some((j) => j.id === id)) {
      return Response.json({ success: false, error: "未知 job" }, { status: 400 });
    }
    const result = await getScheduler().runJob(id, { force: true });
    if (result.busy) {
      return Response.json({ success: false, error: "任务正在运行", busy: true }, { status: 409 });
    }
    if (!result.ok) {
      return Response.json({ success: false, error: result.error }, { status: 500 });
    }
    return Response.json({ success: true, summary: result.summary });
  } catch (err) {
    return jsonError(err, { request: req, status: 500, body: "success-false", fallback: "运行失败" });
  }
}
