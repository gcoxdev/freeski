import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "assets/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["*.config.ts", "*.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
