import { describe, it, expect } from "vitest";
import { parseCron, cronMatches } from "@/lib/cron-matcher";

describe("cron-matcher", () => {
  describe("parseCron", () => {
    it("解析标准 5 字段表达式", () => {
      const cron = parseCron("5 17 * * 1-5");
      expect(cron.minute).toEqual([5]);
      expect(cron.hour).toEqual([17]);
      expect(cron.dayOfMonth).toEqual(
        Array.from({ length: 31 }, (_, i) => i + 1),
      );
      expect(cron.month).toEqual(
        Array.from({ length: 12 }, (_, i) => i + 1),
      );
      expect(cron.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
    });

    it("解析星号通配", () => {
      const cron = parseCron("* * * * *");
      expect(cron.minute).toEqual(Array.from({ length: 60 }, (_, i) => i));
      expect(cron.hour).toEqual(Array.from({ length: 24 }, (_, i) => i));
      expect(cron.dayOfMonth).toEqual(
        Array.from({ length: 31 }, (_, i) => i + 1),
      );
      expect(cron.month).toEqual(
        Array.from({ length: 12 }, (_, i) => i + 1),
      );
      expect(cron.dayOfWeek).toEqual(
        Array.from({ length: 7 }, (_, i) => i),
      );
    });

    it("解析步进表达式 */15", () => {
      const cron = parseCron("*/15 * * * *");
      expect(cron.minute).toEqual([0, 15, 30, 45]);
    });

    it("解析范围表达式 9-17", () => {
      const cron = parseCron("0 9-17 * * *");
      expect(cron.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    });

    it("解析逗号列表 0,30", () => {
      const cron = parseCron("0,30 * * * *");
      expect(cron.minute).toEqual([0, 30]);
    });

    it("无效表达式抛异常", () => {
      expect(() => parseCron("")).toThrow();
      expect(() => parseCron("5 17 * *")).toThrow(); // 4 字段
      expect(() => parseCron("a b c d e f")).toThrow(); // 6 字段
    });
  });

  describe("cronMatches", () => {
    it("匹配工作日 17:05", () => {
      const cron = parseCron("5 17 * * 1-5");
      // 2026-07-20 is Monday
      const mon = new Date("2026-07-20T17:05:00");
      expect(cronMatches(cron, mon)).toBe(true);
      // 2026-07-18 is Saturday
      const sat = new Date("2026-07-18T17:05:00");
      expect(cronMatches(cron, sat)).toBe(false);
      // Sunday
      const sun = new Date("2026-07-19T17:05:00");
      expect(cronMatches(cron, sun)).toBe(false);
    });

    it("*/15 每 15 分钟", () => {
      const cron = parseCron("*/15 * * * *");
      expect(cronMatches(cron, new Date("2026-07-20T17:00:00"))).toBe(true);
      expect(cronMatches(cron, new Date("2026-07-20T17:15:00"))).toBe(true);
      expect(cronMatches(cron, new Date("2026-07-20T17:30:00"))).toBe(true);
      expect(cronMatches(cron, new Date("2026-07-20T17:45:00"))).toBe(true);
      expect(cronMatches(cron, new Date("2026-07-20T17:07:00"))).toBe(false);
      expect(cronMatches(cron, new Date("2026-07-20T17:22:00"))).toBe(false);
    });

    it("N-M 范围匹配", () => {
      const cron = parseCron("0 9-17 * * *");
      expect(cronMatches(cron, new Date("2026-07-20T09:00:00"))).toBe(true);
      expect(cronMatches(cron, new Date("2026-07-20T12:00:00"))).toBe(true);
      expect(cronMatches(cron, new Date("2026-07-20T17:00:00"))).toBe(true);
      expect(cronMatches(cron, new Date("2026-07-20T08:00:00"))).toBe(false);
      expect(cronMatches(cron, new Date("2026-07-20T18:00:00"))).toBe(false);
    });

    it("N,M 逗号列表匹配", () => {
      const cron = parseCron("0,30 9 * * *");
      expect(cronMatches(cron, new Date("2026-07-20T09:00:00"))).toBe(true);
      expect(cronMatches(cron, new Date("2026-07-20T09:30:00"))).toBe(true);
      expect(cronMatches(cron, new Date("2026-07-20T09:15:00"))).toBe(false);
    });

    it("精确月份匹配", () => {
      const cron = parseCron("0 0 1 1 *");
      // Jan 1
      expect(cronMatches(cron, new Date("2026-01-01T00:00:00"))).toBe(true);
      // Feb 1
      expect(cronMatches(cron, new Date("2026-02-01T00:00:00"))).toBe(false);
    });

    it("跨月日匹配", () => {
      const cron = parseCron("30 4 1,15 * *");
      expect(cronMatches(cron, new Date("2026-07-01T04:30:00"))).toBe(true);
      expect(cronMatches(cron, new Date("2026-07-15T04:30:00"))).toBe(true);
      expect(cronMatches(cron, new Date("2026-07-02T04:30:00"))).toBe(false);
    });
  });
});
