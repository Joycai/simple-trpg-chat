"use client";

import { useTranslations } from "next-intl";
import { RouteError } from "@/components/shared/RouteError";

/** Sits in the admin layout's content area; the sidebar stays usable. */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("common");
  const tAdmin = useTranslations("admin");
  return <RouteError error={error} retry={retry} hint={t("errorPageHintAdmin")} backHref="/admin" backLabel={tAdmin("dashboard")} />;
}
