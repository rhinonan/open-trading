import { NextRequest } from "next/server";
import { getSetting, setSetting } from "@/services/settings-service";

export async function GET() {
  try {
    const cron = (await getSetting("eval_schedule_cron")) || "5 17 * * 1-5";
    const enabled = (await getSetting("eval_schedule_enabled")) || "true";
    return Response.json({ success: true, cron, enabled: enabled === "true" });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "获取失败" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { cron, enabled } = await req.json();
    if (cron !== undefined) {
      if (typeof cron !== "string" || cron.trim().split(/\s+/).length !== 5) {
        return Response.json({ success: false, error: "cron 格式需为 5 字段" }, { status: 400 });
      }
      await setSetting("eval_schedule_cron", cron.trim());
    }
    if (enabled !== undefined) {
      await setSetting("eval_schedule_enabled", enabled ? "true" : "false");
    }
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "保存失败" },
      { status: 500 }
    );
  }
}
