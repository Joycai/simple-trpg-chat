import { getCachedSiteTitle } from "@/lib/config";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const siteTitle = await getCachedSiteTitle();

  return <LoginForm siteTitle={siteTitle} />;
}
