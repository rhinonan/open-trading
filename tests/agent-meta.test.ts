// tests/agent-meta.test.ts
// P0-5：注册键合同 —— mastra.listAgents() 与 AGENT_META 键集合一致
import { describe, it, expect } from "vitest";
import {
  AGENT_KEYS,
  AGENT_META,
  AGENT_ID_BY_KEY,
  AGENT_KEY_BY_ID,
  type AgentKey,
} from "@/mastra/agent-meta";
import { isAgentKey } from "@/mastra/get-agent";

describe("agent naming contract", () => {
  it("AGENT_META 键集合与 AGENT_KEYS 完全一致", () => {
    const metaKeys = Object.keys(AGENT_META).sort();
    const constKeys = [...AGENT_KEYS].sort();
    expect(metaKeys).toEqual(constKeys);
  });

  it("isAgentKey 识别已知键、拒绝未知键", () => {
    expect(isAgentKey("opinionAgent")).toBe(true);
    expect(isAgentKey("evaluatorAgent")).toBe(true);
    expect(isAgentKey("skillReviewerAgent")).toBe(true);
    expect(isAgentKey("opinion-agent")).toBe(false);
    expect(isAgentKey("unknown")).toBe(false);
  });

  it("AGENT_ID_BY_KEY 与 AGENT_KEY_BY_ID 互逆", () => {
    for (const key of AGENT_KEYS) {
      const id = AGENT_ID_BY_KEY[key];
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(AGENT_KEY_BY_ID[id]).toBe(key);
    }
  });

  it("mastra.listAgents() 键与 AGENT_META 一致，且 id 与映射表对齐", async () => {
    const { mastra } = await import("@/mastra");
    const registered = Object.keys(mastra.listAgents()).sort();
    const metaKeys = Object.keys(AGENT_META).sort();
    expect(registered).toEqual(metaKeys);

    for (const key of AGENT_KEYS) {
      const agent = mastra.getAgent(key as AgentKey);
      expect(agent).toBeTruthy();
      expect(agent.id).toBe(AGENT_ID_BY_KEY[key]);
    }
  });
});
