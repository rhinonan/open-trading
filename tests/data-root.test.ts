// tests/data-root.test.ts
// dataPath 单点：默认 <cwd>/data，可被 DATA_ROOT 环境变量整体重定向。
import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import { getDataRoot, dataPath } from "@/lib/data-root";

const ORIGINAL = process.env.DATA_ROOT;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DATA_ROOT;
  else process.env.DATA_ROOT = ORIGINAL;
});

describe("data-root", () => {
  it("默认返回 <cwd>/data", () => {
    delete process.env.DATA_ROOT;
    expect(getDataRoot()).toBe(path.join(process.cwd(), "data"));
  });

  it("DATA_ROOT 环境变量可整体重定向（每次调用时读取，非模块加载时冻结）", () => {
    process.env.DATA_ROOT = path.join("D:", "elsewhere");
    expect(getDataRoot()).toBe(path.join("D:", "elsewhere"));
    expect(dataPath("douyin.db")).toBe(path.join("D:", "elsewhere", "douyin.db"));
  });

  it("dataPath 在根目录下拼接多级子路径", () => {
    delete process.env.DATA_ROOT;
    expect(dataPath("api-cache")).toBe(
      path.join(process.cwd(), "data", "api-cache")
    );
    expect(dataPath("workspace", "evaluator")).toBe(
      path.join(process.cwd(), "data", "workspace", "evaluator")
    );
  });
});
