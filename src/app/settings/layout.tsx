import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminAuthEnabled } from "@/lib/admin-auth";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-session";
import { SettingsTabs } from "./settings-tabs";

/**
 * 设置区服务端门禁。
 * 未设 ADMIN_TOKEN 时放行，与写 API / requireAdmin 一致。
 * 深链 next 在客户端被挡时只能落到 /settings；登录后进设置根即可。
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isAdminAuthEnabled()) {
    const jar = await cookies();
    const raw = jar.get(ADMIN_SESSION_COOKIE)?.value;
    if (!verifyAdminSessionToken(raw)) {
      redirect("/login?next=%2Fsettings");
    }
  }

  return (
    <div className="space-y-6">
      <SettingsTabs />
      {children}
    </div>
  );
}
