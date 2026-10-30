import { defineConfig } from "vite";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
// Render production components and styles; only replace the Next server boundary.
export default defineConfig({
  root,
  resolve: {
    alias: [
      { find: "@/app/actions/asset-studio", replacement: path.join(root, "tests/responsive/asset-actions.ts") },
      { find: "next/navigation", replacement: path.join(root, "tests/responsive/navigation.ts") },
      ...["checks", "sticker", "skills", "character", "messages"].map((name) => ({
        find: `@/app/actions/${name}`,
        replacement: path.join(root, "tests/responsive/server-actions.ts"),
      })),
      { find: "next/link", replacement: path.join(root, "tests/responsive/link.tsx") },
      { find: "@", replacement: path.join(root, "src") },
    ],
  },
  server: { host: "127.0.0.1", port: 3100, strictPort: true },
});
