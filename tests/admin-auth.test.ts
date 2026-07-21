// tests/admin-auth.test.ts
import { describe, it, expect, afterEach } from "vitest";
import {
  requireAdmin,
  isAdminAuthEnabled,
  extractAdminToken,
  verifyAdminToken,
} from "@/lib/admin-auth";
import {
  sealAdminSession,
  ADMIN_SESSION_COOKIE,
} from "@/lib/admin-session";

const ORIGINAL = process.env.ADMIN_TOKEN;
const ORIGINAL_SECRET = process.env.SESSION_SECRET;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = ORIGINAL;
  if (ORIGINAL_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = ORIGINAL_SECRET;
});

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/x", { headers });
}

describe("admin-auth", () => {
  it("未设置 ADMIN_TOKEN 时放行", () => {
    delete process.env.ADMIN_TOKEN;
    expect(isAdminAuthEnabled()).toBe(false);
    expect(requireAdmin(req())).toBeNull();
  });

  it("设置后无凭证 → 401", async () => {
    process.env.ADMIN_TOKEN = "secret-token";
    expect(isAdminAuthEnabled()).toBe(true);
    const res = requireAdmin(req());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    const body = await res!.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("Bearer 正确 → 放行", () => {
    process.env.ADMIN_TOKEN = "secret-token";
    expect(
      requireAdmin(req({ Authorization: "Bearer secret-token" })),
    ).toBeNull();
  });

  it("x-admin-token 正确 → 放行", () => {
    process.env.ADMIN_TOKEN = "secret-token";
    expect(requireAdmin(req({ "x-admin-token": "secret-token" }))).toBeNull();
  });

  it("错误 token → 401", () => {
    process.env.ADMIN_TOKEN = "secret-token";
    const res = requireAdmin(req({ Authorization: "Bearer wrong" }));
    expect(res?.status).toBe(401);
  });

  it("有效 session cookie → 放行", () => {
    process.env.ADMIN_TOKEN = "secret-token";
    delete process.env.SESSION_SECRET;
    const session = sealAdminSession()!;
    expect(
      requireAdmin(req({ cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(session)}` })),
    ).toBeNull();
  });

  it("无效 session cookie → 401", () => {
    process.env.ADMIN_TOKEN = "secret-token";
    const res = requireAdmin(req({ cookie: `${ADMIN_SESSION_COOKIE}=garbage` }));
    expect(res?.status).toBe(401);
  });

  it("extractAdminToken 解析 Bearer 与自定义头", () => {
    expect(extractAdminToken(req({ Authorization: "Bearer abc" }))).toBe("abc");
    expect(extractAdminToken(req({ "x-admin-token": "xyz" }))).toBe("xyz");
    expect(extractAdminToken(req())).toBeUndefined();
  });

  it("verifyAdminToken 常量时间比较", () => {
    process.env.ADMIN_TOKEN = "secret-token";
    expect(verifyAdminToken("secret-token")).toBe(true);
    expect(verifyAdminToken("wrong")).toBe(false);
    expect(verifyAdminToken(undefined)).toBe(false);
  });
});
