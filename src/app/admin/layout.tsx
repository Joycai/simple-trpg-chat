import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session || (session.user as any).role !== "admin") {
    redirect("/");
  }

  const t = await getTranslations("admin");

  return (
    <div className="flex h-screen bg-[#0a0e1a] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-[#0f1425] border-r border-purple-500/20 shrink-0 flex flex-col">
        <div className="px-5 py-5 border-b border-purple-500/20">
          <h2 className="text-lg font-bold text-purple-300 tracking-wide">
            {t("sidebarTitle")}
          </h2>
          <p className="text-[10px] text-purple-400/60 mt-1 uppercase tracking-widest">{t("sidebarSubtitle")}</p>
        </div>

        <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
          <p className="text-[10px] text-purple-400/40 uppercase tracking-widest px-2 mb-1">{t("sectionManagement")}</p>
          <SidebarLink href="/admin" icon="📊" label={t("dashboard") || "Dashboard"} />
          <SidebarLink href="/admin/users" icon="👥" label={t("userManagement")} />
          <SidebarLink href="/admin/config" icon="⚙️" label={t("systemConfig") || "系统配置"} />

          <div className="border-t border-purple-500/10 my-3" />
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button type="submit"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-purple-300/70 hover:text-rose-300 hover:bg-rose-500/10 transition-all duration-200">
              <span className="text-base w-5 text-center">🚪</span>
              <span className="font-medium">{t("logout")}</span>
            </button>
          </form>
        </nav>

        <div className="px-4 py-3 border-t border-purple-500/20">
          <div className="flex items-center gap-2 text-xs text-purple-400/60">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {t("systemRunning")}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

function SidebarLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-purple-300/70 hover:text-purple-200 hover:bg-purple-500/10 transition-all duration-200"
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}
