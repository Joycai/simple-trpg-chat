import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AppProvider } from "@/components/AppProvider";
import { getSiteTheme, getUserThemePreference, getSiteThemeMode, getUserThemeModePreference } from "@/app/actions/theme";
import { recordPageVisit } from "@/lib/stats";
import { getCachedSiteTitle, getCachedSiteFavicon } from "@/lib/config";
import { fontVariables } from "./fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const [siteTitle, siteFavicon] = await Promise.all([
    getCachedSiteTitle(),
    getCachedSiteFavicon(),
  ]);
  return {
    title: siteTitle,
    description: "A lightweight web-based TRPG tool for multi-player chat and dice rolling",
    ...(siteFavicon ? { icons: { icon: siteFavicon } } : {}),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const siteTheme = await getSiteTheme();
  const userTheme = await getUserThemePreference();
  const siteMode = await getSiteThemeMode();
  const userMode = await getUserThemeModePreference();

  // Effective mode preference (user > site). 'auto' is resolved against the OS
  // by the inline script below; the server can't read prefers-color-scheme, so
  // it falls back to light for SSR (then the script upgrades to dark pre-paint).
  const initialMode = userMode || siteMode || "auto";

  // Record page visit without blocking layout rendering
  recordPageVisit().catch((err) => {
    console.error("[STATS] Error in recordPageVisit:", err);
  });

  return (
    <html
      lang={locale}
      data-theme={userTheme || siteTheme}
      data-mode={initialMode === "dark" ? "dark" : "light"}
      className={`h-full antialiased ${fontVariables}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var pref = '${initialMode}';
                  var path = window.location.pathname;
                  var match = path.match(/^\\/rooms\\/(\\d+)/);
                  if (match) {
                    var roomId = match[1];
                    var cachedTheme = window.sessionStorage.getItem('room-theme-' + roomId);
                    if (cachedTheme) {
                      document.documentElement.setAttribute('data-theme', cachedTheme);
                    }
                    var cachedMode = window.sessionStorage.getItem('room-mode-' + roomId);
                    if (cachedMode) { pref = cachedMode; }
                  }
                  var resolved = pref === 'dark' ? 'dark'
                    : pref === 'light' ? 'light'
                    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                  document.documentElement.setAttribute('data-mode', resolved);
                } catch (e) {}
              })()
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <AppProvider siteTheme={siteTheme} userTheme={userTheme} siteMode={siteMode} userMode={userMode}>{children}</AppProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
