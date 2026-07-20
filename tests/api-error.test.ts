import { describe, expect, it, vi, afterEach } from "vitest";
import { errorMessage, jsonError, logApiError } from "@/lib/api-error";

describe("api-error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("errorMessage prefers Error.message", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(errorMessage("x", "fallback")).toBe("x");
    expect(errorMessage(null, "fallback")).toBe("fallback");
  });

  it("jsonError logs stack for 500 and returns { error }", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("db down");
    const res = jsonError(err, {
      request: new Request("http://localhost/api/douyin/bloggers", {
        method: "GET",
      }),
      status: 500,
      fallback: "Internal error",
    });
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "db down" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    const rec = JSON.parse(line);
    expect(rec.event).toBe("api.error");
    expect(rec.path).toBe("/api/douyin/bloggers");
    expect(rec.method).toBe("GET");
    expect(rec.message).toBe("db down");
    expect(rec.stack).toContain("db down");
  });

  it("jsonError skips log for 4xx by default", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = jsonError(new Error("已存在"), {
      status: 409,
      fallback: "Internal error",
    });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "已存在" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("jsonError success-false body shape", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = jsonError(new Error("x"), {
      status: 500,
      body: "success-false",
      fallback: "失败",
    });
    await expect(res.json()).resolves.toEqual({ success: false, error: "x" });
  });

  it("logApiError strips sensitive extra keys", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logApiError(new Error("nope"), {
      route: "/api/x",
      extra: { apiKey: "secret", foo: 1 },
    });
    const rec = JSON.parse(String(spy.mock.calls[0][0]));
    expect(rec.apiKey).toBeUndefined();
    expect(rec.foo).toBe(1);
  });
});
