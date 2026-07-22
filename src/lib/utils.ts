import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 格式化粉丝数：≥10000 显示为 X.X万，否则千位分隔 */
export function formatFollowerCount(n: number): string {
  if (n >= 10_000) {
    const wan = Math.floor(n / 1000) / 10; // 截断到 1 位小数，不进位
    return `${wan}万`;
  }
  return n.toLocaleString();
}
