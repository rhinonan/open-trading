// src/lib/api-error.ts
// API 路由统一错误响应：写服务端结构化日志（含 stack）+ 返回 JSON。
// 禁止写入 apiKey / Authorization 等敏感字段。

export function errorMessage(
  err: unknown,
  fallback = "Internal error",
): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

export type JsonErrorOptions = {
  /** 用于日志里的 method / path */
  request?: Request;
  /** 无 request 时手动指定路径 */
  route?: string;
  status?: number;
  fallback?: string;
  /**
   * 响应体形状：
   * - "error"（默认）→ `{ error }`
   * - "success-false" → `{ success: false, error }`
   */
  body?: "error" | "success-false";
  /** 附加到日志的字段（勿放密钥） */
  extra?: Record<string, unknown>;
  /**
   * 是否打服务端日志。默认：status >= 500 时记录。
   * 业务性 4xx（如 409 已存在）可显式 false，或依赖默认跳过。
   */
  log?: boolean;
};

function requestPath(request?: Request, route?: string): string | undefined {
  if (route) return route;
  if (!request?.url) return undefined;
  try {
    return new URL(request.url).pathname;
  } catch {
    return undefined;
  }
}

/** 仅打日志，不构造 Response（特殊 status 分支时用） */
export function logApiError(
  err: unknown,
  opts: Pick<JsonErrorOptions, "request" | "route" | "extra"> & {
    method?: string;
    status?: number;
  } = {},
): void {
  const message = errorMessage(err);
  const method =
    opts.method ??
    (opts.request && "method" in opts.request ? opts.request.method : undefined);
  const path = requestPath(opts.request, opts.route);
  const stack = err instanceof Error ? err.stack : undefined;

  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level: "error",
    event: "api.error",
    method,
    path,
    status: opts.status,
    message,
    stack,
    ...opts.extra,
  };
  for (const k of Object.keys(record)) {
    if (/api[_-]?key|secret|password|authorization|token/i.test(k)) {
      delete record[k];
    }
  }
  console.error(JSON.stringify(record));
}

/**
 * catch 块标准出口：按需 log + JSON Response。
 *
 * @example
 * } catch (err) {
 *   return jsonError(err, { request, fallback: "扫描失败" });
 * }
 */
export function jsonError(err: unknown, opts: JsonErrorOptions = {}): Response {
  const status = opts.status ?? 500;
  const message = errorMessage(err, opts.fallback ?? "Internal error");
  const shouldLog = opts.log ?? status >= 500;

  if (shouldLog) {
    logApiError(err, {
      request: opts.request,
      route: opts.route,
      status,
      extra: opts.extra,
    });
  }

  if (opts.body === "success-false") {
    return Response.json({ success: false, error: message }, { status });
  }
  return Response.json({ error: message }, { status });
}
