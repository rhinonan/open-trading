// src/mastra/resolve-skills.ts
import { getEnabledSkillPaths } from "@/services/skills-service";

/**
 * 动态 skills resolver：每次 agent 请求时从 settings 读取挂载关系，
 * 返回启用 skill 的 data/skills/<name>/ 路径数组。
 * 改挂载无需重启服务。
 */
export async function resolveAgentSkills(agentKey: string): Promise<string[]> {
  try {
    return await getEnabledSkillPaths(agentKey);
  } catch (err) {
    console.error(`[resolveAgentSkills] ${agentKey}:`, err);
    return [];
  }
}
