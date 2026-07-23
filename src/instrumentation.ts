// src/instrumentation.ts
// Next.js 服务端 instrumentation：启动 BullMQ runtime；未 catch 错误落 onRequestError。

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureQueueRuntime } = await import("@/queue/bootstrap");
    ensureQueueRuntime();
  }
}

export async function onRequestError(
  err: { digest: string } & Error,
  request: {
    path: string;
    method: string;
    headers: { [key: string]: string | string[] | undefined };
  },
  context: {
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "middleware";
    renderSource?:
      | "react-server-components"
      | "react-server-components-payload"
      | "server-rendering";
    revalidateReason?: "on-demand" | "stale" | undefined;
    renderType?: "dynamic" | "dynamic-resume";
  },
): Promise<void> {
  const record = {
    ts: new Date().toISOString(),
    level: "error",
    event: "next.onRequestError",
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    digest: err.digest,
    message: err.message,
    stack: err.stack,
  };
  console.error(JSON.stringify(record));
}
