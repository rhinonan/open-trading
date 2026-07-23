// src/queue/bull-board.ts
// Bull Board 适配：供 Next.js catch-all route 使用
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { getQueue } from "./queues";
import { ALL_QUEUE_NAMES } from "./names";

const g = globalThis as typeof globalThis & {
  __otBullBoard?: {
    serverAdapter: ExpressAdapter;
  };
};

export function getBullBoardAdapter(): ExpressAdapter {
  if (g.__otBullBoard) return g.__otBullBoard.serverAdapter;

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/api/admin/queues");

  createBullBoard({
    queues: ALL_QUEUE_NAMES.map((name) => new BullMQAdapter(getQueue(name))),
    serverAdapter,
  });

  g.__otBullBoard = { serverAdapter };
  return serverAdapter;
}
