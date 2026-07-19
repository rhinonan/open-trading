// src/services/scheduler/job-registry.ts
// 生产 job 定义占位；Task 5 填充四个 handler
import type { JobDefinition } from "./types";

/** 生产环境注册表（handler 占位，Task 5 实现） */
export const SCHEDULE_JOBS: JobDefinition[] = [
  {
    id: "profile",
    label: "画像",
    description: "更新博主画像",
    defaultEnabled: false,
    defaultCron: "0 3 * * *",
    handler: async () => {
      /* Task 5 */
    },
  },
  {
    id: "scan",
    label: "扫描",
    description: "扫描博主新作品",
    defaultEnabled: false,
    defaultCron: "0 */2 * * *",
    handler: async () => {
      /* Task 5 */
    },
  },
  {
    id: "pipeline",
    label: "处理",
    description: "转写队列 kick",
    defaultEnabled: true,
    defaultCron: "*/15 * * * *",
    handler: async () => {
      /* Task 5 */
    },
  },
  {
    id: "eval",
    label: "评判",
    description: "预测评判入队",
    defaultEnabled: true,
    defaultCron: "5 17 * * 1-5",
    handler: async () => {
      /* Task 5 */
    },
  },
];
