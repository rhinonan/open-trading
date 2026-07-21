"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

/** 只允许站内相对路径，防止 open redirect */
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/settings";
  if (raw.startsWith("/login")) return "/settings";
  return raw;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const { me, loading, refresh } = useAuth();

  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!me.authRequired || me.authenticated) {
      router.replace(next);
    }
  }, [loading, me.authRequired, me.authenticated, next, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.message || data.error || "登录失败");
        return;
      }
      await refresh();
      router.replace(next);
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setPending(false);
    }
  }

  if (loading || !me.authRequired || me.authenticated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">管理员登录</h1>
          <p className="text-sm text-muted-foreground">
            输入部署时配置的管理令牌（ADMIN_TOKEN）以访问设置页。不开放注册。
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="admin-token" className="text-sm font-medium">
              管理令牌
            </label>
            <Input
              id="admin-token"
              name="token"
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ADMIN_TOKEN"
              required
              disabled={pending}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={pending || !token.trim()}>
            {pending ? "登录中…" : "登录"}
          </Button>
        </form>
      </div>
    </div>
  );
}
