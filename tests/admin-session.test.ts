// tests/admin-session.test.ts
import { describe, it, expect, afterEach } from "vitest";
import {
  sealAdminSession,
  verifyAdminSessionToken,
  parseCookieValue,
  ADMIN_SESSION_COOKIE,
} from "@/lib/admin-session";

const ORIGINAL_TOKEN = process.env.ADMIN_TOKEN;
const ORIGINAL_SECRET = process.env.SESSION_SECRET;

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = ORIGINAL_TOKEN;
  if (ORIGINAL_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = ORIGINAL_SECRET;
});

describe("admin-session", () => {
  it("无密钥时无法签发", () => {
    delete process.env.ADMIN_TOKEN;
    delete process.env.SESSION_SECRET;
    expect(sealAdminSession()).toBeNull();
  });

  it("签发后可校验", () => {
    process.env.ADMIN_TOKEN = "secret-token";
    delete process.env.SESSION_SECRET;
    const token = sealAdminSession(1_700_000_000);
    expect(token).toBeTruthy();
    const session = verifyAdminSessionToken(token, 1_700_000_000 + 10);
    expect(session?.role).toBe("admin");
    expect(session?.exp).toBeGreaterThan(1_700_000_000);
  });

  it("过期无效", () => {
    process.env.ADMIN_TOKEN = "secret-token";
    const token = sealAdminSession(1_700_000_000, 60);
    expect(verifyAdminSessionToken(token, 1_700_000_000 + 61)).toBeNull();
  });

  it("篡改签名无效", () => {
    process.env.ADMIN_TOKEN = "secret-token";
    const token = sealAdminSession(1_700_000_000)!;
    const [payload] = token.split(".");
    expect(verifyAdminSessionToken(`${payload}.deadbeef`, 1_700_000_000)).toBeNull();
  });

  it("SESSION_SECRET 优先于 ADMIN_TOKEN", () => {
    process.env.ADMIN_TOKEN = "token-a";
    process.env.SESSION_SECRET = "session-secret";
    const token = sealAdminSession(1_700_000_000)!;
    // 换掉 SESSION_SECRET 后应失败
    process.env.SESSION_SECRET = "other";
    expect(verifyAdminSessionToken(token, 1_700_000_000)).toBeNull();
    process.env.SESSION_SECRET = "session-secret";
    expect(verifyAdminSessionToken(token, 1_700_000_000)?.role).toBe("admin");
  });

  it("parseCookieValue 解析目标 cookie", () => {
    const header = `a=1; ${ADMIN_SESSION_COOKIE}=abc%2Edef; b=2`;
    expect(parseCookieValue(header)).toBe("abc.def");
    expect(parseCookieValue(null)).toBeUndefined();
  });
});
