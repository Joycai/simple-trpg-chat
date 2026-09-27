"use client";

import { useTranslations } from "next-intl";
import { RouteError } from "@/components/shared/RouteError";

export default function RoomError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("common");
  return <RouteError error={error} retry={retry} hint={t("errorPageHint")} backHref="/" backLabel={t("backToLobby")} fullScreen />;
}
