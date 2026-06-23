import { getCachedSiteTitle, getCachedSiteIcp, getCachedSiteIcpUrl } from "@/lib/config";
import { APP_VERSION } from "@/lib/version";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; ip?: string }>;
}) {
  const [siteTitle, icp, icpUrl] = await Promise.all([
    getCachedSiteTitle(),
    getCachedSiteIcp(),
    getCachedSiteIcpUrl(),
  ]);
  const { reason, ip } = await searchParams;

  return (
    <LoginForm
      siteTitle={siteTitle}
      version={APP_VERSION}
      icp={icp}
      icpUrl={icpUrl}
      noticeReason={reason}
      noticeIp={ip}
    />
  );
}
