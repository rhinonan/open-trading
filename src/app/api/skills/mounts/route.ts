// src/app/api/skills/mounts/route.ts
import { jsonError } from "@/lib/api-error";
import { NextRequest } from "next/server";
import * as skillService from "@/services/skills-service";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    const mounts = await skillService.getAgentSkillMounts();
    const skills = skillService.listSkills();
    return Response.json({ success: true, mounts, skills: skills.map(s => s.name) });
  } catch (err) {
    return jsonError(err, { status: 500, body: "success-false", fallback: "获取挂载失败" });
  }
}

export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { mounts } = await req.json();
    if (!mounts || typeof mounts !== "object") {
      return Response.json({ success: false, error: "mounts 需为对象" }, { status: 400 });
    }
    await skillService.setAgentSkillMounts(mounts);
    return Response.json({ success: true });
  } catch (err) {
    return jsonError(err, { request: req, status: 500, body: "success-false", fallback: "保存挂载失败" });
  }
}
