import {
  getCachedSiteTitle,
  getCachedSiteIcp,
  getCachedSiteIcpUrl,
  getCachedSitePoliceIcon,
  getCachedSitePoliceHtml,
} from "@/lib/config";
import { APP_VERSION } from "@/lib/version";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; ip?: string }>;
}) {
  const [siteTitle, icp, icpUrl, policeIcon, policeHtml] = await Promise.all([
    getCachedSiteTitle(),
    getCachedSiteIcp(),
    getCachedSiteIcpUrl(),
    getCachedSitePoliceIcon(),
    getCachedSitePoliceHtml(),
  ]);
  const { reason, ip } = await searchParams;

  return (
    <LoginForm
      siteTitle={siteTitle}
      version={APP_VERSION}
      icp={icp}
      icpUrl={icpUrl}
      policeIcon={policeIcon}
      policeHtml={policeHtml}
      noticeReason={reason}
      noticeIp={ip}
    />
  );
}
