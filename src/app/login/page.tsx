import { db } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const [titleConfig] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, "site_title"));
  const siteTitle = titleConfig?.value || "Simple TRPG Chat";

  return <LoginForm siteTitle={siteTitle} />;
}
