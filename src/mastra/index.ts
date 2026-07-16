// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { opinionAgent } from "@/mastra/agents/opinion-agent";

export const mastra = new Mastra({
  agents: { opinionAgent },
});
