"use client";

import { useCallback, useEffect, useState } from "react";

export type AuthMe = {
  authRequired: boolean;
  authenticated: boolean;
};

const DEFAULT_ME: AuthMe = { authRequired: false, authenticated: true };

export function useAuth() {
  const [me, setMe] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (!res.ok) {
        setMe(DEFAULT_ME);
        return DEFAULT_ME;
      }
      const data = (await res.json()) as AuthMe;
      const next = {
        authRequired: Boolean(data.authRequired),
        authenticated: Boolean(data.authenticated),
      };
      setMe(next);
      return next;
    } catch {
      setMe(DEFAULT_ME);
      return DEFAULT_ME;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      await refresh();
    }
  }, [refresh]);

  return {
    me: me ?? DEFAULT_ME,
    loading,
    refresh,
    logout,
  };
}
