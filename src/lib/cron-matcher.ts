// src/lib/cron-matcher.ts
// 5 字段 cron (min hour dom mon dow) 匹配器，不引外部依赖

export interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

export function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`无效 cron 表达式: ${expr}`);
  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dayOfMonth: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dayOfWeek: parseField(parts[4], 0, 6),
  };
}

function parseField(field: string, min: number, max: number): number[] {
  if (field === "*") {
    const result: number[] = [];
    for (let i = min; i <= max; i++) result.push(i);
    return result;
  }
  const results = new Set<number>();
  for (const part of field.split(",")) {
    if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      let rMin: number, rMax: number;
      if (range === "*") {
        rMin = min;
        rMax = max;
      } else if (range.includes("-")) {
        [rMin, rMax] = range.split("-").map(Number);
      } else {
        rMin = parseInt(range, 10);
        rMax = max;
      }
      for (let i = rMin; i <= rMax; i += step) results.add(i);
    } else if (part.includes("-")) {
      const [s, e] = part.split("-").map(Number);
      for (let i = s; i <= e; i++) results.add(i);
    } else {
      results.add(parseInt(part, 10));
    }
  }
  return [...results].sort((a, b) => a - b);
}

export function cronMatches(cron: CronFields, date: Date): boolean {
  return (
    cron.minute.includes(date.getMinutes()) &&
    cron.hour.includes(date.getHours()) &&
    cron.dayOfMonth.includes(date.getDate()) &&
    cron.month.includes(date.getMonth() + 1) &&
    cron.dayOfWeek.includes(date.getDay())
  );
}

/** 返回 nextRunAt 的中文描述 */
export function describeCronNext(cron: CronFields, from: Date = new Date()): string {
  // 从 from 开始，每次 +1 min 扫描（最多试 7 天）
  const d = new Date(from);
  d.setSeconds(0, 0);
  for (let i = 0; i < 7 * 24 * 60; i++) {
    d.setMinutes(d.getMinutes() + 1);
    if (cronMatches(cron, d)) {
      const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return `${y}-${m}-${day} ${weekdays[d.getDay()]} ${hm}`;
    }
  }
  return "无匹配（cron 表达式可能无法命中）";
}
