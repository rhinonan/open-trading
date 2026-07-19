// src/services/scheduler/job-registry.ts
// 生产 job 定义：profile / scan / pipeline / eval
import type { JobDefinition } from "./types";
import { runProfileJob } from "./jobs/profile";
import { runScanJob } from "./jobs/scan";
import { runPipelineJob } from "./jobs/pipeline";
import { runEvalJob } from "./jobs/eval";

export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    id: "profile",
    label: "资料更新",
    description: "更新启用中博主的昵称/粉丝/头像",
    defaultEnabled: false,
    defaultCron: "0 8 * * *",
    handler: runProfileJob,
  },
  {
    id: "scan",
    label: "作品扫描",
    description: "扫描启用中博主的新作品",
    defaultEnabled: false,
    defaultCron: "30 8 * * *",
    handler: runScanJob,
  },
  {
    id: "pipeline",
    label: "处理队列",
    description: "kick 转写/图集观点队列（不重试 failed）",
    defaultEnabled: true,
    defaultCron: "*/15 * * * *",
    handler: runPipelineJob,
  },
  {
    id: "eval",
    label: "观点评判",
    description: "新作品入队 + not_yet 重评 + kick",
    defaultEnabled: true,
    defaultCron: "5 17 * * 1-5",
    handler: runEvalJob,
  },
];

/** @deprecated 使用 JOB_DEFINITIONS */
export const SCHEDULE_JOBS = JOB_DEFINITIONS;
