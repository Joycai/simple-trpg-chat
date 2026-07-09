import {
  getCachedSiteTitle,
  getCachedSiteIcp,
  getCachedSiteIcpUrl,
  getCachedSitePoliceIcon,
  getCachedSitePoliceHtml,
} from "@/lib/config";
import { getInviteConfig } from "@/lib/invites";
import { APP_VERSION } from "@/lib/version";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { RegisterForm } from "./RegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  const [t, siteTitle] = await Promise.all([getTranslations("register"), getCachedSiteTitle()]);
  return { title: `${t("title")} | ${siteTitle}` };
}

export default async function RegisterPage() {
  const [siteTitle, icp, icpUrl, policeIcon, policeHtml, inviteConfig] = await Promise.all([
    getCachedSiteTitle(),
    getCachedSiteIcp(),
    getCachedSiteIcpUrl(),
    getCachedSitePoliceIcon(),
    getCachedSitePoliceHtml(),
    getInviteConfig(),
  ]);

  return (
    <RegisterForm
      siteTitle={siteTitle}
      version={APP_VERSION}
      icp={icp}
      icpUrl={icpUrl}
      policeIcon={policeIcon}
      policeHtml={policeHtml}
      registrationEnabled={inviteConfig.registrationEnabled}
    />
  );
}
