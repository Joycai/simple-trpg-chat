import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { getSiteTheme } from "@/app/actions/theme";
import type { ThemeId } from "@/themes/types";
import { AdminThemeSetter } from "@/components/theme/AdminThemeSetter";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { FilingFooter } from "@/components/shared/FilingFooter";
import {
  getCachedSiteTitle,
  getCachedSiteIcp,
  getCachedSiteIcpUrl,
  getCachedSitePoliceIcon,
  getCachedSitePoliceHtml,
} from "@/lib/config";
import { APP_VERSION } from "@/lib/version";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session || session.user.role !== "admin") {
    redirect("/");
  }

  const [siteTheme, siteName, icp, icpUrl, policeIcon, policeHtml] = await Promise.all([
    getSiteTheme(),
    getCachedSiteTitle(),
    getCachedSiteIcp(),
    getCachedSiteIcpUrl(),
    getCachedSitePoliceIcon(),
    getCachedSitePoliceHtml(),
  ]);
  const hasFiling = Boolean(icp || policeIcon || policeHtml);

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
        <main className="flex-1 overflow-y-auto bg-surface-alt flex flex-col">
          <div className="flex-1">{children}</div>
          {hasFiling && (
            <footer className="py-3 px-4 border-t border-border">
              <FilingFooter icp={icp} icpUrl={icpUrl} policeIcon={policeIcon} policeHtml={policeHtml} />
            </footer>
          )}
        </main>
      </div>
    </>
  );
}
