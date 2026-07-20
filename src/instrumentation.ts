// src/instrumentation.ts
// Next.js 服务端 instrumentation：未在 route 内 catch 的错误也会落到这里。
// 已用 jsonError 处理的 500 不会再进 onRequestError（异常未抛出）。

export async function register() {
  // 预留：可在此挂 OTel / 其它全局初始化
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
