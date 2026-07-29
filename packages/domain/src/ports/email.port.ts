/**
 * Outbound email, as a port.
 *
 * The provider is Resend ([ADR-011]), and that sentence is deliberately absent
 * from every other file. Email vendors get acquired, reprice, and have
 * deliverability incidents; the port is what keeps replacing one to a single
 * adapter rather than a change that reaches into the authentication flows.
 *
 * `packages/domain` may import nothing — ADR-001's boundary rule, enforced by
 * depcruise — so this interface cannot accidentally acquire an SDK type. That
 * restriction is the reason the port is credible rather than decorative.
 *
 * Note what is NOT here: templates, retries, batching, scheduling. A port
 * describes the capability the domain needs, not the feature list of the vendor
 * behind it. Everything absent is an adapter's business.
 */

/** A single transactional message. */
export type EmailMessage = {
  readonly to: string;
  readonly subject: string;
  /**
   * Plain text is required; HTML is optional.
   *
   * That ordering is deliberate. A message with only HTML is unreadable to
   * screen readers, text-mode clients, and the spam filters that score
   * multipart messages — and a verification email nobody can read is a user who
   * cannot sign up, failing silently.
   */
  readonly text: string;
  readonly html?: string;
};

/**
 * Thrown when a message could not be handed to the provider.
 *
 * Carries no provider payload: §17 treats a secret-shaped string in a log as a
 * P1, and vendor error bodies routinely echo the API key or the full request.
 * The adapter logs the detail through the redacting logger; this type crosses
 * the boundary carrying only what a caller can act on.
 */
export class EmailDeliveryError extends Error {
  override readonly name = "EmailDeliveryError";

  constructor(
    /** The recipient, so a caller can retry or report. Never the body. */
    readonly recipient: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type EmailPort = {
  /**
   * Hand a message to the provider.
   *
   * Resolving means accepted for delivery — not delivered, and certainly not
   * read. No email API can promise more than that, and a port that implied
   * otherwise would be lying to every caller.
   *
   * @throws {EmailDeliveryError} when the provider rejected the message.
   */
  send: (message: EmailMessage) => Promise<void>;
};
