import { NextResponse } from "next/server";
import { isAdminAuthEnabled } from "@/lib/admin-auth";
import { readAdminSession } from "@/lib/admin-session";
import { jsonError } from "@/lib/api-error";

export async function GET(request: Request) {
  try {
    const authRequired = isAdminAuthEnabled();
    const authenticated = authRequired ? readAdminSession(request) !== null : true;
    return NextResponse.json({ authRequired, authenticated });
  } catch (err) {
    return jsonError(err, { request, route: "/api/auth/me" });
  }
}
