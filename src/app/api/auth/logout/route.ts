import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
} from "@/lib/admin-session";
import { jsonError } from "@/lib/api-error";

export async function POST(request: Request) {
  try {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_SESSION_COOKIE, "", {
      ...adminSessionCookieOptions(0),
      maxAge: 0,
    });
    return res;
  } catch (err) {
    return jsonError(err, { request, route: "/api/auth/logout" });
  }
}
