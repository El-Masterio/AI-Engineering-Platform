// Atelier ESLint configuration (flat config).
//
// This file is the machine-readable form of docs/04-engineering/21-coding-standards.md
// and the layering table in docs/04-engineering/19-folder-structure.md. A standard that
// relies on reviewer memory decays; anything here that CAN be automated IS automated.
//
// Changing a rule's severity is a change to the coding standards and needs the doc
// updated in the same PR.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import importX from "eslint-plugin-import-x";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import comments from "@eslint-community/eslint-plugin-eslint-comments";
import unicorn from "eslint-plugin-unicorn";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettierConfig from "eslint-config-prettier";

/** Packages that sit above domain but below the apps. */
const PLATFORM_PACKAGES = "agent-runtime,policy,cost,capability-packs,observability";

export default tseslint.config(
  // ── Ignores ──────────────────────────────────────────────────────────────
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/.next/**",
      "**/coverage/**",
      "docs/**",
      "skills/**",
    ],
  },

  // ── Base ─────────────────────────────────────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // Type-aware linting. allowDefaultProject covers config files that no
        // package tsconfig includes.
        projectService: {
          allowDefaultProject: ["*.js", "*.mjs", "*.cjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      // A disable comment that no longer suppresses anything is dead weight.
      reportUnusedDisableDirectives: "error",
    },
  },

  // ── §21: the `any` gate ──────────────────────────────────────────────────
  // `any` is an error. The ONLY escape is a disable comment carrying a
  // justification, which require-description enforces:
  //   // eslint-disable-next-line @typescript-eslint/no-explicit-any -- justified: <reason>
  {
    plugins: { "@eslint-community/eslint-comments": comments },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@eslint-community/eslint-comments/require-description": [
        "error",
        { ignore: ["eslint-enable"] },
      ],
      "@eslint-community/eslint-comments/no-aggregating-enable": "error",
      "@eslint-community/eslint-comments/no-duplicate-disable": "error",
      "@eslint-community/eslint-comments/no-unlimited-disable": "error",
    },
  },

  // ── §21: type and correctness rules ──────────────────────────────────────
  {
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/strict-boolean-expressions": "off", // too noisy in practice
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // No TS enums — surprising runtime semantics. Use `as const` + unions.
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message: "TS enums are prohibited (§21). Use an `as const` object plus a union type.",
        },
      ],

      // §21 prohibitions
      "no-console": "error",
      "import-x/no-default-export": "error",
      complexity: ["error", 15],
      "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-param-reassign": ["error", { props: true }],
    },
  },

  // ── Imports ──────────────────────────────────────────────────────────────
  {
    plugins: { "import-x": importX },
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({ alwaysTryTypes: true, noWarnOnMultipleProjects: true }),
      ],
    },
    rules: {
      "import-x/no-cycle": ["error", { maxDepth: Infinity }],
      "import-x/no-self-import": "error",
      "import-x/no-duplicates": "error",
      "import-x/no-extraneous-dependencies": "error",
    },
  },

  // ── §19: enforced layer boundaries ───────────────────────────────────────
  // Two classification axes, because v7 separates them:
  //   • `boundaries/elements` classifies FOLDERS   → the coarse package graph
  //   • `boundaries/files`    classifies FILES     → §19's within-app file roles
  // Element order matters: the first matching pattern wins, so the narrower
  // `repository` folder is declared before the broader `db`.
  {
    plugins: { boundaries },
    settings: {
      // boundaries resolves imports through the legacy `import/resolver` setting,
      // NOT `import-x/resolver-next`. Without this, every cross-package import is
      // classified "unknown" and the policy engine silently skips it.
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["packages/*/tsconfig.json", "apps/*/tsconfig.json"],
        },
      },
      // Deliberately extension-agnostic. NodeNext specifiers are written `.js`
      // while the file on disk is `.ts`; filtering on `*.{ts,tsx}` here left
      // every cross-package dependency classified as "unknown". Do not narrow.
      "boundaries/include": ["apps/**/*", "packages/**/*"],
      "boundaries/elements": [
        { type: "repository", pattern: "packages/db/src/repositories/**", partialMatch: false },
        { type: "db", pattern: "packages/db/**", partialMatch: false },
        { type: "domain", pattern: "packages/domain/**", partialMatch: false },
        { type: "contracts", pattern: "packages/contracts/**", partialMatch: false },
        { type: "ui", pattern: "packages/ui/**", partialMatch: false },
        { type: "platform", pattern: `packages/{${PLATFORM_PACKAGES}}/**`, partialMatch: false },
        { type: "config", pattern: "packages/config/**", partialMatch: false },
        { type: "app", pattern: "apps/**", partialMatch: false },
      ],
      // File roles from §19's layering table. No such files exist yet — these
      // rules arm now so the first *.routes.ts written is governed immediately.
      "boundaries/files": [
        { category: "route", pattern: "**/*.routes.ts" },
        { category: "schema", pattern: "**/*.schema.ts" },
        { category: "service", pattern: "**/*.service.ts" },
        { category: "job", pattern: "**/*.job.ts" },
        { category: "test", pattern: "**/*.{test,spec}.{ts,tsx}" },
      ],
    },
    rules: {
      // An import boundaries cannot classify is skipped by the policy engine —
      // a silent hole in the guardrail. Make it loud instead.
      "boundaries/no-unknown-dependencies": "error",

      // Dependencies point inward. Anything not explicitly allowed is denied.
      // v7 unified rule: `boundaries/dependencies` with object selectors.
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          // Without this, boundaries only evaluates LOCAL dependencies and skips
          // npm/builtin imports entirely — the domain-purity rule below would
          // never fire. Defaults to false; we need it true.
          checkAllOrigins: true,
          message:
            "{{from.element.type}} may not import {{to.element.type}} — dependencies point inward (§19)",
          policies: [
            // ── ORDER IS LOAD-BEARING: the LAST matching policy wins. ─────────
            // So broad allows come first and narrow disallows come last. Getting
            // this backwards silently disables every restriction below — verified
            // empirically, not assumed (see the M002 completion report).

            // npm and node builtins are broadly allowed; narrowed at the bottom.
            { allow: { to: { module: { origin: "external" } } } },
            { allow: { to: { module: { origin: "builtin" } } } },

            // domain knows nothing but itself.
            {
              from: { element: { type: "domain" } },
              allow: { to: { element: { type: "domain" } } },
            },

            {
              from: { element: { type: "contracts" } },
              allow: { to: { element: { types: { anyOf: ["contracts", "domain"] } } } },
            },
            {
              from: { element: { type: "repository" } },
              allow: { to: { element: { types: { anyOf: ["db", "domain", "contracts"] } } } },
            },
            {
              from: { element: { type: "db" } },
              allow: { to: { element: { types: { anyOf: ["db", "domain", "contracts"] } } } },
            },
            {
              from: { element: { type: "platform" } },
              allow: {
                to: { element: { types: { anyOf: ["platform", "domain", "contracts", "db"] } } },
              },
            },
            {
              from: { element: { type: "ui" } },
              allow: { to: { element: { types: { anyOf: ["ui", "contracts"] } } } },
            },

            {
              from: { element: { type: "app" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ["app", "domain", "db", "contracts", "platform", "ui", "config"],
                    },
                  },
                },
              },
            },

            // ── §19 within-app file roles: narrow the broad `app` allow ──────
            // Routes are HTTP-only — parse, authorize, delegate. A route reaching
            // straight into the database or a domain entity skips the service layer.
            {
              from: { file: { categories: { anyOf: ["route"] } } },
              disallow: {
                to: { element: { types: { anyOf: ["db", "repository", "domain"] } } },
              },
              message:
                "*.routes.ts must not import {{to.element.type}} — routes parse, authorize and delegate to a service (§19).",
            },
            {
              from: { file: { categories: { anyOf: ["schema"] } } },
              disallow: {
                to: { element: { types: { anyOf: ["db", "repository", "domain", "platform"] } } },
              },
              message:
                "*.schema.ts describes the wire contract only — import from packages/contracts (§19).",
            },
            {
              from: { element: { type: "repository" } },
              disallow: { to: { file: { categories: { anyOf: ["route", "service"] } } } },
              message: "Repositories must not import services or routes (§19).",
            },

            // ── External-dependency restrictions — MUST be last (last wins) ───
            {
              from: { element: { type: "domain" } },
              disallow: { to: { module: { origin: "external" } } },
              message:
                "packages/domain must have ZERO external dependencies (ADR-001, §19). Inject a port instead.",
            },
            {
              from: { file: { categories: { anyOf: ["service", "job"] } } },
              disallow: {
                to: {
                  module: {
                    origin: "external",
                    source: ["fastify", "@fastify/*", "next", "react", "react-dom"],
                  },
                },
              },
              message:
                "Service and job layers must stay framework-independent (§19). Keep HTTP types in *.routes.ts.",
            },
            {
              from: { element: { type: "repository" } },
              disallow: {
                to: { module: { origin: "external", source: ["fastify", "@fastify/*"] } },
              },
              message: "Repositories must not know about HTTP (§19).",
            },
          ],
        },
      ],
    },
  },

  // ── domain purity: no ambient time or randomness ─────────────────────────
  {
    files: ["packages/domain/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "Date", message: "Inject the clock port instead (§21, ports/clock.port.ts)." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message: "TS enums are prohibited (§21). Use an `as const` object plus a union type.",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "Date.now() in domain code is prohibited (§21). Inject the clock port.",
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: "Math.random() is prohibited (§21). Use crypto, via an injected port.",
        },
      ],
    },
  },

  // ── Unicorn: naming and modern idioms ────────────────────────────────────
  {
    plugins: { unicorn },
    rules: {
      ...unicorn.configs.recommended.rules,
      // §19 naming: kebab-case files; PascalCase allowed for React components.
      "unicorn/filename-case": ["error", { cases: { kebabCase: true, pascalCase: true } }],
      // Fights our domain vocabulary rule ("say `organization`, not `org`").
      "unicorn/prevent-abbreviations": "off",
      // null is meaningful against a SQL database.
      "unicorn/no-null": "off",
      "unicorn/no-array-reduce": "off",
      // We deliberately avoid default exports (§21).
      "unicorn/prefer-module": "error",
      "unicorn/prefer-node-protocol": "error",
    },
  },

  // ── React / JSX accessibility (ready for M008; no .tsx exists yet) ───────
  {
    files: ["**/*.tsx"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: { ...jsxA11y.flatConfigs.recommended.rules },
  },

  // ── Tests: relax what does not apply ─────────────────────────────────────
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "e2e/**", "evals/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "max-lines": "off",
      "boundaries/element-types": "off",
      "boundaries/external": "off",
    },
  },

  // ── Scripts and tooling: console is the point ────────────────────────────
  {
    files: ["scripts/**", "*.config.js", "*.config.mjs", "eslint.config.js"],
    rules: {
      "no-console": "off",
      "import-x/no-default-export": "off",
      "import-x/no-extraneous-dependencies": "off",
    },
  },

  // ── Plain JS/config files get no type-aware rules ────────────────────────
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // ── CommonJS tooling config files need CJS globals ───────────────────────
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "writable",
        require: "readonly",
        exports: "writable",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "unicorn/prefer-module": "off",
      "import-x/no-default-export": "off",
    },
  },

  // ── Prettier last: formatting is never a lint concern ────────────────────
  prettierConfig,
);
