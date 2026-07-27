/**
 * Conventional Commits, enforced. The format is machine-parsed for changelog
 * generation (§24), so it is a contract rather than a style preference.
 *
 * Types and subject rules mirror docs/04-engineering/22-development-standards.md.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // §22's exact type list — nothing else is accepted.
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "refactor", "perf", "test", "docs", "chore", "build", "ci", "revert"],
    ],
    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"],

    "scope-case": [2, "always", "kebab-case"],

    // Imperative mood, no capitalized start, no trailing period (§22).
    //
    // Expressed as `never [sentence-case, start-case, …]` rather than
    // `always lower-case` on purpose: the strict form also rejects acronyms
    // anywhere in the subject, which would block legitimate messages this
    // project will write constantly — "add OTel tracing" (M006), "enforce RLS
    // policies" (M004), "wire SSO and SCIM" (M121). This form still rejects
    // "Add thing" while allowing "add OTel tracing".
    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],

    // Readable in `git log --oneline`.
    "header-max-length": [2, "always", 72],

    // Body explains WHY; the diff already shows what.
    "body-leading-blank": [2, "always"],
    "body-max-line-length": [1, "always", 100],
    "footer-leading-blank": [2, "always"],
  },
};
