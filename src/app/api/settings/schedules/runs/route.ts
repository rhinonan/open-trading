// src/app/api/settings/schedules/runs/route.ts
// GET 查询最近 job 运行历史
import { jsonError } from "@/lib/api-error";
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";
import { desc, eq, and, sql } from "drizzle-orm";
import {
  ensureSchedulerStarted,
  JOB_DEFINITIONS,
  type ScheduleJobId,
} from "@/services/scheduler";

const VALID_IDS = new Set(JOB_DEFINITIONS.map((j) => j.id));

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  ensureSchedulerStarted();
  try {
    const jobId = req.nextUrl.searchParams.get("jobId") as ScheduleJobId | null;
    const limitStr = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(parseInt(limitStr || "20", 10) || 20, 100);

    const conds = [];
    if (jobId && VALID_IDS.has(jobId)) {
      conds.push(eq(jobRuns.jobId, jobId));
    }

    const rows = db
      .select()
      .from(jobRuns)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(jobRuns.startedAt))
      .limit(limit)
      .all();

    return Response.json({ success: true, runs: rows });
  } catch (err) {
    return jsonError(err, { request: req, status: 500, body: "success-false", fallback: "获取运行历史失败" });
  }
}
