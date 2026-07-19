// src/lib/admin-auth.ts
// 写操作最小鉴权（P0-4）。
//
// 约定：
// - 未设置 ADMIN_TOKEN：全部放行（本机开发默认）。
// - 已设置 ADMIN_TOKEN：写接口须带
//     Authorization: Bearer <ADMIN_TOKEN>
//   或
//     x-admin-token: <ADMIN_TOKEN>
// - 不要把 ADMIN_TOKEN 塞进 NEXT_PUBLIC_*；浏览器直连写接口时，
//   生产应经反向代理注入头，或暂不设 token、仅内网访问。

import { timingSafeEqual } from "node:crypto";

export function getAdminToken(): string | undefined {
  const t = process.env.ADMIN_TOKEN?.trim();
  return t ? t : undefined;
}

/** 鉴权是否启用（有 token 即启用） */
export function isAdminAuthEnabled(): boolean {
  return getAdminToken() !== undefined;
}

function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** 从请求提取候选 token（Bearer 或 x-admin-token） */
export function extractAdminToken(request: Request): string | undefined {
  const headerToken = request.headers.get("x-admin-token")?.trim();
  if (headerToken) return headerToken;

  const auth = request.headers.get("authorization");
  if (!auth) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m?.[1]?.trim() || undefined;
}

/**
 * 校验写操作权限。
 * @returns null 表示通过；否则返回应直接 return 的 401 Response
 */
export function requireAdmin(request: Request): Response | null {
  const expected = getAdminToken();
  if (!expected) return null;

  const provided = extractAdminToken(request);
  if (!provided || !safeEqualString(provided, expected)) {
    return Response.json(
      { error: "Unauthorized", message: "需要有效的 ADMIN_TOKEN" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }
  return null;
}
