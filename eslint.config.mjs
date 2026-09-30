import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**", ".tradelab-build/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".venv/**", ".venv.nosync/**", "data/**", "db/**", "docs/**", "test-results/**", "playwright-report/**", "public/pdfjs/**", "eval_outputs/**",
  ]),
]);

export default eslintConfig;
