import { getCachedSiteTitle } from "@/lib/config";
import { APP_VERSION } from "@/lib/version";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; ip?: string }>;
}) {
  const siteTitle = await getCachedSiteTitle();
  const { reason, ip } = await searchParams;

  return (
    <LoginForm
      siteTitle={siteTitle}
      version={APP_VERSION}
      noticeReason={reason}
      noticeIp={ip}
    />
  );
}
