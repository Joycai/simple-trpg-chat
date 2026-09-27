import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Shown when the room page calls `notFound()` for an id with no room. */
export default async function RoomNotFound() {
  const t = await getTranslations("room");
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-bg">
      <h1 className="text-2xl font-bold text-text-muted">{t("notFound")}</h1>
      <Link href="/" className="text-primary hover:underline">
        {t("backToLobby")}
      </Link>
    </div>
  );
}
