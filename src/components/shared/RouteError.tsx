"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";

interface RouteErrorProps {
  error: Error & { digest?: string };
  /** The boundary's `retry` — re-fetches and re-renders the segment. */
  retry: () => void;
  hint: string;
  backHref: string;
  backLabel: string;
  /** Fill the viewport (a route without surrounding chrome) or sit inside a layout's content area. */
  fullScreen?: boolean;
}

/**
 * Body of a route segment's `error.tsx`: the `LoadFailed` look scaled up to a
 * page, plus a way out. The message itself is never shown — in production it is
 * Next's generic sentence, and in development Next's overlay already has the
 * details — only the digest, which matches the server log line.
 */
export function RouteError({ error, retry, hint, backHref, backLabel, fullScreen = false }: RouteErrorProps) {
  const t = useTranslations("common");
  // `retry` re-renders the segment in a transition, so its pending state
  // tells us when the attempt has finished (either way).
  const [retrying, startRetry] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={`flex flex-col items-center justify-center gap-4 px-4 text-center ${fullScreen ? "min-h-dvh bg-bg" : "py-24"}`}>
      <Icons.AlertTriangle className="w-12 h-12 text-text-dim opacity-50" />
      <h1 className="text-2xl font-bold text-text-muted">{t("error")}</h1>
      <p className="text-sm text-text-dim max-w-sm">{hint}</p>
      <div className="flex items-center gap-5">
        <button
          onClick={() => startRetry(() => retry())}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-primary border border-primary/40 rounded-theme px-3 py-1.5 hover:bg-primary/10 transition cursor-pointer disabled:opacity-60 disabled:cursor-default"
        >
          {retrying ? <Icons.Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icons.RefreshCw className="w-3.5 h-3.5" />}
          {t("retry")}
        </button>
        <Link href={backHref} className="text-sm text-primary hover:underline">
          {backLabel}
        </Link>
      </div>
      {error.digest && <p className="text-xs font-mono text-text-dim">{t("errorDigest", { digest: error.digest })}</p>}
    </div>
  );
}
