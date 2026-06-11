import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LayoutDashboard, Users, Settings, LogOut, BarChart3, Cpu } from "lucide-react";
import { getSiteTheme } from "@/app/actions/theme";
import type { ThemeId } from "@/themes/types";
import { AdminThemeSetter } from "@/components/AdminThemeSetter";
import type { ReactNode } from "react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session || (session.user as any).role !== "admin") {
    redirect("/");
  }

  const t = await getTranslations("admin");
  const siteTheme = await getSiteTheme();

  return (
    <>
      <AdminThemeSetter theme={siteTheme as ThemeId} />
      <div className="flex h-screen bg-bg overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-surface border-r border-border shrink-0 flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <h2 className="text-lg font-bold text-text tracking-wide">
            {t("sidebarTitle")}
          </h2>
          <p className="text-[10px] text-text-dim mt-1 uppercase tracking-widest">{t("sidebarSubtitle")}</p>
        </div>

        <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
          <p className="text-[10px] text-text-dim uppercase tracking-widest px-2 mb-1">{t("sectionManagement")}</p>
          <SidebarLink href="/admin" icon={<LayoutDashboard className="w-4 h-4" />} label={t("dashboard")} />
          <SidebarLink href="/admin/users" icon={<Users className="w-4 h-4" />} label={t("userManagement")} />
          <SidebarLink href="/admin/ai" icon={<Cpu className="w-4 h-4" />} label={t("aiFeatures")} />
          <SidebarLink href="/admin/usage" icon={<BarChart3 className="w-4.5 h-4.5 text-text-muted/70" />} label={t("tokenUsage")} isSub={true} />
          <SidebarLink href="/admin/config" icon={<Settings className="w-4 h-4" />} label={t("systemConfig")} />

          <div className="border-t border-border my-3" />
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button type="submit"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-danger hover:bg-danger/10 transition-all duration-200">
              <LogOut className="w-4 h-4" />
              <span className="font-medium">{t("logout")}</span>
            </button>
          </form>
        </nav>

        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-text-dim">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            {t("systemRunning")}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-surface-alt">
        {children}
      </main>
    </div>
    </>
  );
}

function SidebarLink({ href, icon, label, isSub }: { href: string; icon: ReactNode; label: string; isSub?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 py-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-alt transition-all duration-200 ${
        isSub ? "pl-9 pr-3 text-xs" : "px-3 text-sm"
      }`}
    >
      <span className={`flex items-center justify-center ${isSub ? "w-4.5 h-4.5" : "w-5 h-5"}`}>{icon}</span>
      <span className={isSub ? "font-normal" : "font-medium"}>{label}</span>
    </Link>
  );
}
