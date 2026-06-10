import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AppProvider } from "@/components/AppProvider";
import { getSiteTheme } from "@/app/actions/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simple TRPG Chat",
  description: "A lightweight web-based TRPG tool for multi-player chat and dice rolling",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const siteTheme = await getSiteTheme();

  return (
    <html lang={locale} data-theme={siteTheme} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <AppProvider initialTheme={siteTheme}>{children}</AppProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
