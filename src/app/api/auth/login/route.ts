import { NextResponse } from "next/server";
import { isAdminAuthEnabled, verifyAdminToken } from "@/lib/admin-auth";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  sealAdminSession,
} from "@/lib/admin-session";
import { jsonError } from "@/lib/api-error";

export async function POST(request: Request) {
  try {
    if (!isAdminAuthEnabled()) {
      return NextResponse.json(
        { error: "Auth disabled", message: "当前未启用鉴权（未设置 ADMIN_TOKEN）" },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Bad Request", message: "需要 JSON body" },
        { status: 400 },
      );
    }

    const token =
      body &&
      typeof body === "object" &&
      typeof (body as { token?: unknown }).token === "string"
        ? (body as { token: string }).token.trim()
        : "";

    if (!token || !verifyAdminToken(token)) {
      return NextResponse.json(
        { error: "Unauthorized", message: "管理令牌无效" },
        { status: 401 },
      );
    }

    const sessionToken = sealAdminSession();
    if (!sessionToken) {
      return NextResponse.json(
        {
          error: "Server Error",
          message: "无法签发会话，请检查 SESSION_SECRET 或 ADMIN_TOKEN",
        },
        { status: 500 },
      );
    }

    const res = NextResponse.json({ ok: true, authenticated: true });
    res.cookies.set(
      ADMIN_SESSION_COOKIE,
      sessionToken,
      adminSessionCookieOptions(),
    );
    return res;
  } catch (err) {
    return jsonError(err, { request, route: "/api/auth/login" });
  }
}
