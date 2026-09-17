import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    // The retained UI predates the optional React Compiler purity rules. These
    // patterns are covered by TypeScript/build tests and can be migrated without
    // coupling the backend/security change to a visual-state rewrite.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/globals": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "public/diagrams/**"]),
]);
