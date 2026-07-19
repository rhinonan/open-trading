// tests/admin-auth.test.ts
import { describe, it, expect, afterEach } from "vitest";
import {
  requireAdmin,
  isAdminAuthEnabled,
  extractAdminToken,
} from "@/lib/admin-auth";

const ORIGINAL = process.env.ADMIN_TOKEN;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = ORIGINAL;
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

  it("extractAdminToken 解析 Bearer 与自定义头", () => {
    expect(extractAdminToken(req({ Authorization: "Bearer abc" }))).toBe("abc");
    expect(extractAdminToken(req({ "x-admin-token": "xyz" }))).toBe("xyz");
    expect(extractAdminToken(req())).toBeUndefined();
  });
});
