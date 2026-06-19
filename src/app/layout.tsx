import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AppProvider } from "@/components/AppProvider";
import { getSiteTheme, getUserThemePreference } from "@/app/actions/theme";
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

  // Record page visit without blocking layout rendering
  recordPageVisit().catch((err) => {
    console.error("[STATS] Error in recordPageVisit:", err);
  });

  return (
    <html lang={locale} data-theme={userTheme || siteTheme} className={`h-full antialiased ${fontVariables}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var path = window.location.pathname;
                  var match = path.match(/^\\/rooms\\/(\\d+)/);
                  if (match) {
                    var roomId = match[1];
                    var cachedTheme = window.sessionStorage.getItem('room-theme-' + roomId);
                    if (cachedTheme) {
                      document.documentElement.setAttribute('data-theme', cachedTheme);
                    }
                  }
                } catch (e) {}
              })()
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <AppProvider siteTheme={siteTheme} userTheme={userTheme}>{children}</AppProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
