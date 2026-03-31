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
  ]),
  // Relax strict rules for test files
  {
    files: ["__tests__/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "prefer-const": "off",
      "react-hooks/rules-of-hooks": "off",
      "@typescript-eslint/ban-types": "off",
      "react/no-unescaped-entities": "off",
    },
  },
  // Ignore generated coverage reports
  globalIgnores(["coverage/**"]),
]);

export default eslintConfig;
