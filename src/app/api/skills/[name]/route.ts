// src/app/api/skills/[name]/route.ts
import { NextRequest } from "next/server";
import * as skillService from "@/services/skills-service";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await ctx.params;
    const skill = skillService.getSkill(name);
    if (!skill) return Response.json({ success: false, error: "Skill 不存在" }, { status: 404 });
    return Response.json({ success: true, skill });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "获取失败" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await ctx.params;
    const { action } = await req.json();
    if (action === "enable") skillService.enableSkill(name);
    else if (action === "disable") skillService.disableSkill(name);
    else return Response.json({ success: false, error: "仅支持 enable/disable" }, { status: 400 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "操作失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await ctx.params;
    // 检查 staging 中是否存在同名项目
    const stagingItems = skillService.listStaging();
    const inStaging = stagingItems.find(s => s.name === name);
    if (inStaging) {
      skillService.discardStaging(name);
      return Response.json({ success: true });
    }
    // 否则删除正式 skill
    skillService.deleteSkill(name);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "删除失败" },
      { status: 500 }
    );
  }
}
