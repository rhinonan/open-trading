// src/app/api/llm/models/route.ts
import { jsonError } from "@/lib/api-error";

import { DEFAULT_NEWAPI_BASE_URL } from "@/lib/llm-constants";

export async function GET() {
  const apiKey = process.env.NEWAPI_API_KEY;
  const baseUrl = process.env.NEWAPI_BASE_URL || DEFAULT_NEWAPI_BASE_URL;

  if (!apiKey) {
    return Response.json(
      { error: "NEWAPI_API_KEY 未配置" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return Response.json(
        { error: `newapi 返回 ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const models = (Array.isArray(data?.data) ? data.data : [])
      .map((m: { id?: unknown }) => m?.id)
      .filter((id: unknown): id is string => typeof id === "string")
      .sort((a: string, b: string) => a.localeCompare(b));

    return Response.json({ models });
  } catch (err) {
    return jsonError(err, { status: 502, fallback: "获取模型列表失败" });
  }
}
