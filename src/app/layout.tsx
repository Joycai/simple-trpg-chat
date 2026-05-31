import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simple TRPG Chat",
  description: "A lightweight web-based TRPG tool for multi-player chat and dice rolling",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
