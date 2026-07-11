import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.NEWAPI_API_KEY;
    if (!apiKey) {
      throw new Error("NEWAPI_API_KEY environment variable is not set");
    }
    client = new Anthropic({
      baseURL: process.env.NEWAPI_BASE_URL || "https://newapi.tdance.cc/v1",
      apiKey,
    });
  }
  return client;
}

export interface CallClaudeOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callClaude(
  userMessage: string,
  systemPrompt: string,
  options: CallClaudeOptions = {}
): Promise<string> {
  const anthropic = getAnthropicClient();

  const response = await anthropic.messages.create({
    model: options.model || "claude-sonnet-4-20250514",
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.3,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Unexpected response format from Claude: no text block");
  }

  return textBlock.text;
}

export function parseClaudeJson<T>(raw: string): T {
  // Claude sometimes wraps JSON in ```json ... ``` fences
  const cleaned = raw
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```\s*$/g, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
