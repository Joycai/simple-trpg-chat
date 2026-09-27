"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/** Themed stand-in for `alert()` — rendered as a strip under the panel header. */
export type Banner = { kind: "success" | "error"; text: string };

/** How long a success banner stays up before fading itself out. */
const BANNER_TTL = 3200;

/** The notebook's one message strip. `fail` shows an error (the action's
 *  localized message, or the generic one). */
export function useNotebookBanner() {
  const tCommon = useTranslations("common");
  const [banner, setBanner] = useState<Banner | null>(null);

  // A success banner is an acknowledgement, not a message to act on — it clears
  // itself. Errors stay until dismissed or replaced.
  useEffect(() => {
    if (banner?.kind !== "success") return;
    const id = setTimeout(() => setBanner(null), BANNER_TTL);
    return () => clearTimeout(id);
  }, [banner]);

  const fail = (text?: string) => setBanner({ kind: "error", text: text ?? tCommon("error") });

  return { banner, setBanner, fail };
}
