import { getTranslations } from "next-intl/server";
import type { Fail } from "@/lib/actions/result";

/** The failure a write action returns when `tryRoomAccess` comes back null. */
export async function noRoomAccess(): Promise<Fail> {
  return { success: false, error: (await getTranslations("roomActions"))("errorNoAccess") };
}
