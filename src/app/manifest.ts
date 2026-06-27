import type { MetadataRoute } from "next";
import { getCachedSiteTitle } from "@/lib/config";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const siteTitle = await getCachedSiteTitle();
  return {
    name: siteTitle || "Simple TRPG Chat",
    short_name: "TRPG",
    description:
      "A lightweight web-based TRPG tool for multi-player chat and dice rolling",
    start_url: "/",
    display: "standalone",
    theme_color: "#0D1E28",
    background_color: "#060C10",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
