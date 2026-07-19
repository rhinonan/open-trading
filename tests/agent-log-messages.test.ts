// tests/agent-log-messages.test.ts
import { describe, it, expect } from "vitest";
import {
  parseSpanToReplayMessages,
  textFromContent,
  coerceJson,
} from "@/lib/agent-log-messages";

describe("agent-log-messages", () => {
  it("解析 AI SDK UIMessage[] parts（chat 场景）", () => {
    const input = [
      {
        parts: [{ type: "text", text: "测试" }],
        id: "f25toHVu9RWaowtY",
        role: "user",
      },
    ];
    const output = { text: "非投资相关内容", files: [] };
    const msgs = parseSpanToReplayMessages(input, output);
    expect(msgs).toEqual([
      { id: "f25toHVu9RWaowtY", role: "user", text: "测试" },
      { id: "out-1", role: "assistant", text: "非投资相关内容" },
    ]);
  });

  it("解析纯字符串 input + {text} output（generate 场景）", () => {
    const msgs = parseSpanToReplayMessages(
      "测试日志 span：今天上证看多",
      { text: "博主今天看多", files: [] },
    );
    expect(msgs.map((m) => [m.role, m.text])).toEqual([
      ["user", "测试日志 span：今天上证看多"],
      ["assistant", "博主今天看多"],
    ]);
  });

  it("解析 JSON 字符串形式的 UIMessage 数组", () => {
    const raw = JSON.stringify([
      {
        parts: [{ type: "text", text: "你好" }],
        id: "x1",
        role: "user",
      },
    ]);
    const msgs = parseSpanToReplayMessages(raw, "收到");
    expect(msgs[0]).toMatchObject({ role: "user", text: "你好" });
    expect(msgs[1]).toMatchObject({ role: "assistant", text: "收到" });
  });

  it("textFromContent 处理 parts / content 数组", () => {
    expect(
      textFromContent([{ type: "text", text: "a" }, { type: "text", text: "b" }]),
    ).toBe("ab");
    expect(textFromContent({ text: "hi" })).toBe("hi");
  });

  it("coerceJson 对非 JSON 字符串原样返回", () => {
    expect(coerceJson("plain text")).toBe("plain text");
    expect(coerceJson('{"a":1}')).toEqual({ a: 1 });
  });
});
