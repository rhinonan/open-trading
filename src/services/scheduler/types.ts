// src/services/scheduler/types.ts
// 定时任务调度类型

export type ScheduleJobId = "profile" | "scan" | "pipeline" | "eval";

export interface JobDefinition {
  id: ScheduleJobId;
  label: string;
  description: string;
  defaultEnabled: boolean;
  defaultCron: string;
  handler: () => Promise<void | { summary?: string }>;
}

export interface RunJobResult {
  ok: boolean;
  busy?: boolean;
  error?: string;
  summary?: string;
}
