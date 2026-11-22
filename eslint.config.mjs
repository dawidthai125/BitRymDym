import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 2026-11-22: not app code — editor tooling (CommonJS), archived audit scratch files,
    // bundled worker output (scripts/build-studio-workers.mjs) and agent worktrees.
    ".cursor/**",
    "docs/audits/**",
    "public/workers/**",
    ".claude/**",
  ]),
  {
    // Leading underscore = intentionally unused (omitted rest siblings, unused callback args).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;
