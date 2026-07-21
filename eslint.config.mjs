import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".open-next/**",
    "out/**",
    "build/**",
    "public/sw.js",
    "next-env.d.ts",
  ]),
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // Allow setState in effects - common pattern for data fetching
      "react-hooks/set-state-in-effect": "warn",
      // Allow <img> tags for dynamic URLs from Supabase storage
      "@next/next/no-img-element": "warn",
    },
  },
]);

export default eslintConfig;
