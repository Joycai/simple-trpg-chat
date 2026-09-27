import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Site-wide 404: unmatched URLs, and any `notFound()` without a closer boundary. */
export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-bg">
      <p className="text-5xl font-bold font-theme-display text-text-dim">404</p>
      <h1 className="text-2xl font-bold text-text-muted">{t("pageNotFound")}</h1>
      <Link href="/" className="text-primary hover:underline">
        {t("backToLobby")}
      </Link>
    </div>
  );
}
