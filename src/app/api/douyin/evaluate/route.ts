// src/app/api/douyin/evaluate/route.ts
// Task 6 接入 eval-queue + eval-runner 后实物化；当前为占位

export async function POST(_request: Request) {
  return Response.json({
    success: true,
    enqueued: 0,
    message: "待 eval-queue 接入（Task 6）",
  });
}
