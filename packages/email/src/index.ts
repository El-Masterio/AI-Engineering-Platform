/**
 * Transactional email adapters (ADR-011).
 *
 * The interface lives in `@atelier/domain` as `EmailPort`; this package holds
 * the implementations. Consumers depend on the port and receive an adapter —
 * nothing outside these two files knows the provider's name.
 */
export {
  createConsoleEmailAdapter,
  type ConsoleEmailAdapter,
  type ConsoleEmailAdapterOptions,
  type SentEmail,
} from "./console.adapter.js";
export { createResendEmailAdapter, type ResendEmailAdapterOptions } from "./resend.adapter.js";
