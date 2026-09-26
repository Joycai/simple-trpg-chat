import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Allow intentionally-unused identifiers when prefixed with `_`
  // (placeholder params, ignored destructure slots, mock signatures).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Layering rules (CLAUDE.md › Layering). Each block owns a disjoint file set:
  // a later entry for the same rule replaces, not merges, an earlier one.
  // R2–R4 use import/no-restricted-paths because it resolves the real file, so
  // a relative specifier (`../../db`) can't slip past an alias-only pattern.
  // R2: schema.ts may only pull in dependency-free, client-safe modules.
  {
    files: ["src/db/schema.ts"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/db/schema.ts",
              from: ["./src/lib", "./src/components", "./src/app"],
              except: ["./messaging/audience.ts"],
              message:
                "schema.ts may only import dependency-free, client-safe modules (see CLAUDE.md › Layering).",
            },
          ],
        },
      ],
    },
  },
  // R3: components never reach into the db layer, not even for types.
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/components",
              from: "./src/db",
              message: "Components must not import from @/db — use a client-safe export under src/lib/.",
            },
          ],
        },
      ],
    },
  },
  // R4: lib sits below components and app.
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    ignores: ["src/lib/**/__tests__/**"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/lib",
              from: ["./src/components", "./src/app"],
              message: "src/lib must not depend on components/app.",
            },
          ],
        },
      ],
    },
  },
  // R5: server actions don't import each other; shared logic lives in src/lib.
  {
    files: ["src/app/actions/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/actions/*", "./*"],
              message: "Server actions must not import each other — move shared logic to src/lib.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local-only tooling (gitignored): vendored bundles / design-sync scratch.
    ".ds-sync/**",
    "ds-bundle/**",
    // Claude Code metadata, including full git worktrees under .claude/worktrees/.
    ".claude/**",
  ]),
]);

export default eslintConfig;
