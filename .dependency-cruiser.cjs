/**
 * dependency-cruiser configuration.
 *
 * ESLint's boundaries plugin catches layer violations per-file. This catches the
 * things a per-file linter structurally cannot see: cycles that span several
 * modules, and orphaned code. `no-circular` is an ERROR and fails the build
 * (NFR-MAINT-4).
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular dependency. Cycles make modules impossible to extract later and break " +
        "predictable initialization order. See NFR-MAINT-4 and §19.",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-imports-nothing",
      severity: "error",
      comment:
        "packages/domain must have zero dependencies — that purity is what makes the fast " +
        "unit-test layer in §23 possible. Inject a port instead (ADR-001, §19).",
      from: { path: "^packages/domain/src" },
      to: {
        pathNot: ["^packages/domain/src", "^node_modules/typescript/lib"],
      },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment: "Unreachable module. Delete it — git remembers (§21).",
      from: {
        orphan: true,
        pathNot: [
          String.raw`(^|/)\.[^/]+\.(js|cjs|mjs|ts|json)$`,
          String.raw`\.d\.ts$`,
          String.raw`(^|/)tsconfig\.json$`,
          String.raw`(^|/)(?:package|package-lock)\.json$`,
          String.raw`(^|/)src/index\.ts$`,
        ],
      },
      to: {},
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment: "Import does not resolve. Broken build waiting to happen.",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-duplicate-dep-types",
      severity: "warn",
      comment: "Dependency declared in more than one dependency category.",
      from: {},
      to: { moreThanOneDependencyType: true, dependencyTypesNot: ["type-only"] },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      comment: "Production code must not import a devDependency — it will be absent at runtime.",
      from: {
        path: "^(apps|packages)/[^/]+/src",
        // Type-only declarations, tests, stories and test-support code are not
        // shipped, so a devDependency import from them is correct rather than a
        // defect. `src/testing/` is excluded from each package's tsconfig.build
        // as well, so this is not merely a linter exemption — the code genuinely
        // does not reach dist.
        pathNot: String.raw`\.(test|spec)\.tsx?$|\.d\.ts$|\.stories\.tsx?$|/src/testing/`,
      },
      to: { dependencyTypes: ["npm-dev"] },
    },
  ],

  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: String.raw`(^|/)(dist|coverage|\.turbo|\.next)/|(^|/)next-env\.d\.ts$` },
    tsPreCompilationDeps: true,

    // Points at the workspace-spanning root tsconfig, NOT packages/config's base
    // (a base has no inputs of its own → TS18003). The root config is what lets
    // dependency-cruiser resolve NodeNext `./x.js` specifiers to `./x.ts` on disk;
    // without it every relative import is unresolvable and no-circular can never
    // fire — a silently useless guardrail.
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types"],
      extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".json"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
