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
// Cross-cutting infrastructure packages. `auth` and `email` belong here rather
// than in a bucket of their own: they are adapters over an external service or
// library, they depend on domain and db, and nothing depends on them except an
// app. Registering them is not a formality — an unregistered package is
// classified "unknown", and `no-unknown-dependencies` exists because an
// unclassified import is silently exempt from every rule below.
const PLATFORM_PACKAGES = "agent-runtime,policy,cost,capability-packs,observability,auth,email";

export default tseslint.config(
  // ── Ignores ──────────────────────────────────────────────────────────────
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/.next/**",
      "**/next-env.d.ts",
      "**/coverage/**",
      // Storybook's build output. Absent from a clean checkout, so this gap
      // stayed invisible until CI started building it: ESLint was type-checking
      // minified vendor bundles and taking 110s to report nonsense about them.
      "**/storybook-static/**",
      "**/.playwright-mcp/**",
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
      "no-param-reassign": [
        "error",
        {
          props: true,
          // Mutating these IS the function's purpose; flagging it is noise.
          ignorePropertyModificationsFor: ["document", "draft", "acc", "accumulator"],
        },
      ],
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
            // `origin: "builtin"` does NOT match a `node:`-prefixed specifier,
            // and unicorn/prefer-node-protocol requires that prefix — so between
            // them every `import ... from "node:fs"` fell through to the default
            // disallow. It went unnoticed until M004, because no non-test source
            // file in a package had imported a builtin before. The narrowing
            // policies at the bottom still apply: domain purity is verified to
            // reject `node:fs` even with this allow in place.
            { allow: { to: { module: { source: "node:*" } } } },

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
            // The same `node:`-prefix blind spot as the allow above, and here it
            // mattered more: this rule is the one enforcing ADR-001's zero-
            // dependency guarantee, and `import { readFile } from "node:fs"` in
            // a domain entity sailed straight through it. Proven by writing the
            // violation — the rule reported nothing until this policy existed.
            {
              from: { element: { type: "domain" } },
              disallow: { to: { module: { source: "node:*" } } },
              message:
                "packages/domain must not touch the Node runtime (ADR-001, §19). Pure logic only — inject a port.",
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

  // ── §18 governance: no hardcoded design values in components ─────────────
  // Components reference SEMANTIC tokens only. A literal colour or raw px size
  // is invisible to theming, so it silently breaks light mode and the contrast
  // guarantee that scripts/check-contrast.mjs enforces over the token set.
  // tokens.css is exempt by construction — it is CSS, not linted here.
  {
    files: ["packages/ui/**/*.{ts,tsx}", "apps/web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message: "TS enums are prohibited (§21). Use an `as const` object plus a union type.",
        },
        {
          // #fff / #ffffff / #ffffffff
          selector: String.raw`Literal[value=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/]`,
          message:
            "Hardcoded colour. Use a semantic design token (§18) — e.g. `bg-surface`, `text-primary`, or var(--text-primary). Literals bypass theming and the contrast gate.",
        },
        {
          selector: String.raw`TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/]`,
          message: "Hardcoded colour in a template literal. Use a semantic design token (§18).",
        },
        {
          selector: String.raw`Literal[value=/\b(?:rgb|rgba|hsl|hsla)\(/]`,
          message:
            "Hardcoded colour function. Use a semantic design token (§18) rather than a literal colour.",
        },
        {
          // Reaching past the semantic layer into a raw scale.
          selector: String.raw`Literal[value=/var\(\s*--(?:n|a|ok|warn|err|info|run)-[0-9]/]`,
          message:
            "Primitive token referenced directly. Components must use SEMANTIC tokens (--bg-*, --text-*, --border-*, --status-*), never a raw scale (§18).",
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
      // Same problem: it renames `Props` -> `Properties` and `props` ->
      // `properties`. `Props` IS the React vocabulary; §21 says match the
      // domain's terms, so this rule is actively wrong here.
      "unicorn/name-replacements": "off",
      // null is meaningful against a SQL database.
      "unicorn/no-null": "off",
      "unicorn/no-array-reduce": "off",
      // We deliberately avoid default exports (§21).
      "unicorn/prefer-module": "error",
      // Iterator helpers (.toArray()) are ES2025; packages compile against
      // ES2023, so the rule suggests an API TypeScript cannot type here.
      // Revisit when the shared lib target moves past ES2023.
      "unicorn/prefer-iterator-to-array": "off",
      "unicorn/prefer-iterator-to-array-at-end": "off",
      "unicorn/prefer-node-protocol": "error",
    },
  },

  // ── React / JSX accessibility (ready for M008; no .tsx exists yet) ───────
  {
    files: ["**/*.tsx"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: { ...jsxA11y.flatConfigs.recommended.rules },
  },

  // ── Tests and stories: relax what does not apply ─────────────────────────
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.stories.tsx",
      ".storybook/**",
      "vitest.config.ts",
      "vitest.setup.ts",
      "e2e/**",
      "evals/**",
    ],
    rules: {
      // Test and story tooling lives in the root devDependencies by design.
      "import-x/no-extraneous-dependencies": "off",
      "import-x/no-default-export": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "max-lines": "off",
      // Rule names must match the v7 unified rule; the pre-rename names were
      // silently no-ops here.
      "boundaries/dependencies": "off",
      "boundaries/no-unknown-dependencies": "off",
      // beforeAll/beforeEach assigning a module-scoped fixture is the canonical
      // test-setup shape. The rule guards against accidental global mutation in
      // product code, which is a different problem — the alternative here is
      // wrapping every fixture in a holder object to satisfy a linter.
      "unicorn/no-top-level-assignment-in-function": "off",
    },
  },

  // ── This file ────────────────────────────────────────────────────────────
  // `max-lines` exists to stop logic accreting in one place. This is a
  // declarative manifest that is roughly half explanatory comment by design,
  // and the boundaries policy list in particular MUST be readable top to bottom
  // in one file: its ordering is load-bearing (last match wins), and splitting
  // it across modules would hide the single most error-prone thing about it.
  {
    files: ["eslint.config.js"],
    rules: { "max-lines": ["warn", { max: 800, skipBlankLines: true, skipComments: true }] },
  },

  // ── jsdom environment shims ──────────────────────────────────────────────
  // A polyfill's whole job is assigning to globals and matching a native shape.
  // These rules are correct for product code and wrong here.
  {
    files: ["vitest.setup.ts"],
    rules: {
      "unicorn/no-global-object-property-assignment": "off",
      "unicorn/no-useless-undefined": "off",
      "unicorn/consistent-class-member-order": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-empty-function": "off",
    },
  },

  // ── Next.js app: the framework's contract requires default exports ───────
  // Pages, layouts, error and loading boundaries are matched by filename and
  // MUST default-export. That is the framework's API, not a style choice.
  {
    files: [
      "apps/web/src/app/**/page.tsx",
      "apps/web/src/app/**/layout.tsx",
      "apps/web/src/app/**/error.tsx",
      "apps/web/src/app/**/loading.tsx",
      "apps/web/src/app/**/not-found.tsx",
      "apps/web/src/app/**/template.tsx",
      "apps/web/*.config.{ts,mjs}",
      // Vitest, Vite and friends read a default export; that is their contract.
      "*.config.{ts,mjs,js}",
      "packages/*/*.config.{ts,mjs,js}",
    ],
    rules: { "import-x/no-default-export": "off" },
  },

  // Next.js owns the app-directory naming contract: `[param]`, `(group)`,
  // `@slot`. unicorn/filename-case cannot know that, and renaming would break
  // routing.
  {
    files: ["apps/web/src/app/**"],
    rules: { "unicorn/filename-case": "off" },
  },

  // ── Scripts and tooling: console is the point ────────────────────────────
  {
    files: [
      "scripts/**",
      "packages/*/src/testing/*.mjs",
      "*.config.js",
      "*.config.mjs",
      "eslint.config.js",
    ],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        AbortSignal: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      // A script's job is to run and exit with a status. That is the CLI case
      // the rule carves out; it just cannot tell these files are CLIs.
      "unicorn/no-process-exit": "off",
      "import-x/no-default-export": "off",
      "import-x/no-extraneous-dependencies": "off",
      // resolve() walks a var() chain — genuine recursion, not an accidental one.
      "unicorn/no-useless-recursion": "off",
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
