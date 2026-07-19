// src/lib/agent-log-messages.ts
// 把 Mastra observability span 的 input/output 规范成可回放的消息列表。
// 支持：纯字符串、{ text }、AI SDK UIMessage（parts）、{ messages }、消息数组。

export type ReplayRole = "user" | "assistant" | "system";

export interface ReplayMessage {
  id: string;
  role: ReplayRole;
  text: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** 尽量把任意 payload 解成 JS 值（可能已是对象） */
export function coerceJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const s = value.trim();
  if (!s) return "";
  if (
    !(s.startsWith("{") || s.startsWith("[") || s.startsWith('"'))
  ) {
    return value;
  }
  try {
    return JSON.parse(s);
  } catch {
    return value;
  }
}

/** 从 content / parts 等字段抽出纯文本 */
export function textFromContent(content: unknown): string {
  const v = coerceJson(content);
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);

  if (Array.isArray(v)) {
    // UIMessage.parts 或 content parts
    const chunks = v
      .map((part) => {
        if (typeof part === "string") return part;
        if (!isRecord(part)) return "";
        if (typeof part.text === "string") return part.text;
        if (part.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        if (typeof part.content === "string") return part.content;
        return "";
      })
      .filter(Boolean);
    return chunks.join("");
  }

  if (isRecord(v)) {
    if (typeof v.text === "string") return v.text;
    if (typeof v.content === "string") return v.content;
    if (Array.isArray(v.parts)) return textFromContent(v.parts);
    if (Array.isArray(v.content)) return textFromContent(v.content);
  }

  return "";
}

function normalizeRole(role: unknown): ReplayRole {
  if (role === "assistant" || role === "system" || role === "user") {
    return role;
  }
  if (role === "model" || role === "bot" || role === "ai") return "assistant";
  return "user";
}

/** 判断是否像一条带 role 的消息 */
function looksLikeMessage(v: unknown): v is Record<string, unknown> {
  if (!isRecord(v)) return false;
  if (typeof v.role !== "string") return false;
  return (
    "parts" in v ||
    "content" in v ||
    "text" in v ||
    Array.isArray(v.parts)
  );
}

function messageFromUnknown(
  v: unknown,
  fallbackRole: ReplayRole,
  id: string,
): ReplayMessage | null {
  if (v == null) return null;

  if (typeof v === "string") {
    const text = v.trim();
    return text ? { id, role: fallbackRole, text } : null;
  }

  if (looksLikeMessage(v)) {
    const role = normalizeRole(v.role);
    // UIMessage: parts 优先
    let text = "";
    if (Array.isArray(v.parts)) text = textFromContent(v.parts);
    if (!text && v.content != null) text = textFromContent(v.content);
    if (!text && typeof v.text === "string") text = v.text;
    text = text.trim();
    if (!text) return null;
    return {
      id: typeof v.id === "string" ? v.id : id,
      role,
      text,
    };
  }

  // { text } / generate 结果
  if (isRecord(v)) {
    const text = textFromContent(v).trim();
    if (text) return { id, role: fallbackRole, text };
  }

  return null;
}

/**
 * 将 span.input / span.output 解析为回放消息。
 * - input 常为 UIMessage[] 或 string
 * - output 常为 { text } 或 string
 */
export function parseSpanToReplayMessages(
  input: unknown,
  output: unknown,
): ReplayMessage[] {
  const messages: ReplayMessage[] = [];
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${seq++}`;

  const inVal = coerceJson(input);

  if (Array.isArray(inVal)) {
    // UIMessage[] 或 content parts；若首项有 role 当消息列表
    if (inVal.length > 0 && looksLikeMessage(inVal[0])) {
      for (const item of inVal) {
        const m = messageFromUnknown(item, "user", nextId("in"));
        if (m) messages.push(m);
      }
    } else {
      // 可能是 parts-only
      const text = textFromContent(inVal).trim();
      if (text) {
        messages.push({ id: nextId("in"), role: "user", text });
      }
    }
  } else if (isRecord(inVal) && Array.isArray(inVal.messages)) {
    for (const item of inVal.messages) {
      const m = messageFromUnknown(item, "user", nextId("in"));
      if (m) messages.push(m);
    }
  } else {
    const m = messageFromUnknown(inVal, "user", nextId("in"));
    if (m) messages.push(m);
  }

  const outVal = coerceJson(output);
  // output 一般是助手回复；若已是带 role 的消息/列表则尊重原 role
  if (Array.isArray(outVal) && outVal.length > 0 && looksLikeMessage(outVal[0])) {
    for (const item of outVal) {
      const m = messageFromUnknown(item, "assistant", nextId("out"));
      if (m) messages.push(m);
    }
  } else if (isRecord(outVal) && Array.isArray(outVal.messages)) {
    for (const item of outVal.messages) {
      const m = messageFromUnknown(item, "assistant", nextId("out"));
      if (m) messages.push(m);
    }
  } else {
    const m = messageFromUnknown(outVal, "assistant", nextId("out"));
    if (m) {
      // 避免与 input 里已有的 assistant 完全重复（罕见）
      const dup = messages.some(
        (x) => x.role === "assistant" && x.text === m.text,
      );
      if (!dup) messages.push({ ...m, role: "assistant" });
    }
  }

  return messages;
}
