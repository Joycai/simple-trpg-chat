import { defineConfig } from "@playwright/test";

const viewports = [
  { name: "small-phone", width: 320, height: 568 },
  { name: "phone-portrait", width: 390, height: 844 },
  { name: "phone-landscape", width: 844, height: 390 },
  { name: "ipad-portrait", width: 820, height: 1180 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "ipad-pro-portrait", width: 1024, height: 1366 },
];

export default defineConfig({
  testDir: "./tests/responsive",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100/tests/responsive/",
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: ["chromium", "webkit"].flatMap((browserName) =>
    viewports.map(({ name, width, height }) => ({
      name: `${browserName}-${name}`,
      use: { browserName: browserName as "chromium" | "webkit", viewport: { width, height } },
    })),
  ),
  webServer: {
    command: "pnpm exec vite --config tests/responsive/vite.config.ts",
    url: "http://127.0.0.1:3100/tests/responsive/",
    reuseExistingServer: !process.env.CI,
  },
});
