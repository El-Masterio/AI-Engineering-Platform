/**
 * Test-only type augmentation for this package.
 *
 * The matcher extensions are registered at runtime by the root vitest.setup.ts,
 * but that file sits outside this package's TypeScript program — so the types
 * have to be declared here too, or every `expect(...)` in a test resolves to an
 * untyped call and typescript-eslint floods with no-unsafe-call.
 */
import "@testing-library/jest-dom/vitest";

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- justified: declaration merging into an external module requires `interface`; a type alias cannot merge.
  interface Matchers<T = unknown> {
    /** axe-core assertion registered in vitest.setup.ts (M008: "axe clean"). */
    toHaveNoA11yViolations: () => Promise<T>;
  }
}
