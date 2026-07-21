// 管理端会话 cookie（设置页登录）。
// 不把 ADMIN_TOKEN 明文写入 cookie，只签 role=admin + 过期时间。
// 签名密钥：SESSION_SECRET（优先）或 ADMIN_TOKEN。

import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "ot_session";
/** 7 天 */
export const ADMIN_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

/** 签名密钥：SESSION_SECRET 优先，否则 ADMIN_TOKEN（避免与 admin-auth 循环依赖） */
export function getSessionSecret(): string | undefined {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const token = process.env.ADMIN_TOKEN?.trim();
  return token ? token : undefined;
}

function b64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(input: string): Buffer | null {
  try {
    const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payloadB64).digest());
}

function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export type AdminSession = {
  role: "admin";
  exp: number;
};

/** 签发 session token（不含 cookie 封装） */
export function sealAdminSession(
  nowSec: number = Math.floor(Date.now() / 1000),
  maxAgeSec: number = ADMIN_SESSION_MAX_AGE_SEC,
): string | null {
  const secret = getSessionSecret();
  if (!secret) return null;

  const payload: AdminSession = {
    role: "admin",
    exp: nowSec + maxAgeSec,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = sign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/** 校验 session token；无效返回 null */
export function verifyAdminSessionToken(
  token: string | undefined | null,
  nowSec: number = Math.floor(Date.now() / 1000),
): AdminSession | null {
  if (!token) return null;
  const secret = getSessionSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expected = sign(payloadB64, secret);
  if (!safeEqualString(sig, expected)) return null;

  const raw = b64urlDecode(payloadB64);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as AdminSession).role !== "admin" ||
    typeof (parsed as AdminSession).exp !== "number"
  ) {
    return null;
  }

  const session = parsed as AdminSession;
  if (session.exp <= nowSec) return null;
  return session;
}

/** 从 Cookie 头解析 ot_session 值 */
export function parseCookieValue(
  cookieHeader: string | null | undefined,
  name: string = ADMIN_SESSION_COOKIE,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    const v = part.slice(idx + 1).trim();
    if (!v) return undefined;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return undefined;
}

/** 从 Request 读取并校验管理会话 */
export function readAdminSession(
  request: Request,
  nowSec?: number,
): AdminSession | null {
  const raw = parseCookieValue(request.headers.get("cookie"));
  return verifyAdminSessionToken(raw, nowSec);
}

export function adminSessionCookieOptions(maxAgeSec: number = ADMIN_SESSION_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}
