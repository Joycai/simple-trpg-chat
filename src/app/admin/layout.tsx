import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { getSiteTheme } from "@/app/actions/theme";
import type { ThemeId } from "@/themes/types";
import { AdminThemeSetter } from "@/components/theme/AdminThemeSetter";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { getCachedSiteTitle } from "@/lib/config";
import { APP_VERSION } from "@/lib/version";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/");
  }

  const [siteTheme, siteName] = await Promise.all([
    getSiteTheme(),
    getCachedSiteTitle(),
  ]);

  const handleLogout = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <>
      <AdminThemeSetter theme={siteTheme as ThemeId} />
      <div className="flex flex-col md:flex-row h-screen bg-bg overflow-hidden">
        {/* Responsive Sidebar */}
        <AdminSidebar onLogout={handleLogout} siteName={siteName} version={APP_VERSION} />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-surface-alt">
          {children}
        </main>
      </div>
    </>
  );
}
