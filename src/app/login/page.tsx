import {
  getCachedSiteTitle,
  getCachedSiteIcp,
  getCachedSiteIcpUrl,
  getCachedSitePoliceIcon,
  getCachedSitePoliceHtml,
} from "@/lib/config";
import { APP_VERSION } from "@/lib/version";
import { getInviteConfig } from "@/lib/invites";
import { getSiteTheme, getSiteThemeMode } from "@/app/actions/theme";
import { LoginThemeSetter } from "@/components/theme/LoginThemeSetter";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; ip?: string }>;
}) {
  const [siteTitle, icp, icpUrl, policeIcon, policeHtml, inviteConfig, siteTheme, siteMode] = await Promise.all([
    getCachedSiteTitle(),
    getCachedSiteIcp(),
    getCachedSiteIcpUrl(),
    getCachedSitePoliceIcon(),
    getCachedSitePoliceHtml(),
    getInviteConfig(),
    getSiteTheme(),
    getSiteThemeMode(),
  ]);
  const { reason, ip } = await searchParams;

  return (
    <>
      <LoginThemeSetter theme={siteTheme} mode={siteMode} />
      <LoginForm
        siteTitle={siteTitle}
        version={APP_VERSION}
        icp={icp}
        icpUrl={icpUrl}
        policeIcon={policeIcon}
        policeHtml={policeHtml}
        noticeReason={reason}
        noticeIp={ip}
        registrationEnabled={inviteConfig.registrationEnabled}
      />
    </>
  );
}
